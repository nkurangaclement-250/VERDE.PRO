import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import AuthScreen from "./AuthScreen";

const API_BASE = "http://127.0.0.1:8000";

/* =========================================================
   AUTH / TOKEN HELPERS
========================================================= */

function getAccessToken() {
  return localStorage.getItem("verde_access_token");
}

function getRefreshToken() {
  return localStorage.getItem("verde_refresh_token");
}

function saveTokens(data) {
  if (data?.access_token) {
    localStorage.setItem("verde_access_token", data.access_token);
  }

  if (data?.refresh_token) {
    localStorage.setItem("verde_refresh_token", data.refresh_token);
  }
}

function clearTokens() {
  localStorage.removeItem("verde_access_token");
  localStorage.removeItem("verde_refresh_token");
}

/* =========================================================
   REFRESH ACCESS TOKEN
========================================================= */

async function refreshAccessToken() {
  const refresh_token = getRefreshToken();

  if (!refresh_token) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token,
      }),
    });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const data = await response.json();

    saveTokens(data);

    return true;
  } catch (error) {
    console.error("TOKEN REFRESH ERROR:", error);
    return false;
  }
}

/* =========================================================
   API FETCH
========================================================= */

async function apiFetch(path, options = {}, retry = true) {
  const token = getAccessToken();

  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  /*
    If access token expired, try refreshing it once.
  */
  if (
    response.status === 401 &&
    retry &&
    getRefreshToken()
  ) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return apiFetch(path, options, false);
    }
  }

  return response;
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    name:
      user.name ||
      user.display_name ||
      "Verde user",
  };
}

const AI_MODES = [
  { id: "chat", label: "General", icon: "✦", description: "Balanced everyday assistance" },
  { id: "tutor", label: "Tutor", icon: "🎓", description: "Learn step by step" },
  { id: "coding", label: "Coding", icon: "⌘", description: "Build and debug code" },
  { id: "writer", label: "Writer", icon: "✎", description: "Write and improve content" },
  { id: "research", label: "Research", icon: "⌕", description: "Organize evidence and ideas" },
];


/* =========================================================
   MARKDOWN-LITE MESSAGE CONTENT + SAFE BROWSER CODE RUNNER
========================================================= */

function CodeBlock({ code, language, showNotice }) {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const runIdRef = useRef(`verde-code-${Math.random().toString(36).slice(2)}`);

  const normalizedLanguage = (language || "text").toLowerCase();
  const canRun = ["js", "javascript"].includes(normalizedLanguage);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showNotice("Code copied.");
    } catch (error) {
      console.error("COPY CODE ERROR:", error);
      showNotice("Could not copy the code.");
    }
  };

  const runCode = () => {
    if (!canRun) {
      showNotice("Run is currently available for JavaScript code blocks.");
      return;
    }

    setRunning(true);
    setOutput("Running…");

    const runId = runIdRef.current;
    const source = `
      (() => {
        const send = (type, value) => {
          try {
            parent.postMessage({
              source: "verde-code-runner",
              runId: ${JSON.stringify(runId)},
              type,
              value: String(value)
            }, "*");
          } catch {}
        };

        console.log = (...args) => send("log", args.join(" "));
        console.info = (...args) => send("log", args.join(" "));
        console.warn = (...args) => send("log", args.join(" "));
        console.error = (...args) => send("error", args.join(" "));

        try {
          const result = (() => {
            ${code}
          })();
          if (result !== undefined) send("log", result);
        } catch (error) {
          send("error", error?.stack || error?.message || error);
        }
        send("done", "");
      })();
    `;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";

    let timeoutId;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
      setRunning(false);
    };

    const handleMessage = (event) => {
      const data = event.data;
      if (!data || data.source !== "verde-code-runner" || data.runId !== runId) return;

      if (data.type === "log") {
        setOutput((current) =>
          current === "Running…" ? data.value : `${current}\n${data.value}`
        );
      } else if (data.type === "error") {
        setOutput((current) =>
          current === "Running…" ? `Error: ${data.value}` : `${current}\nError: ${data.value}`
        );
      } else if (data.type === "done") {
        cleanup();
      }
    };

    window.addEventListener("message", handleMessage);

    timeoutId = window.setTimeout(() => {
      setOutput((current) =>
        current === "Running…"
          ? "Stopped: execution timed out."
          : `${current}\nStopped: execution timed out.`
      );
      cleanup();
    }, 2000);

    const safeSource = source.replaceAll("</script", "<\\/script");
    iframe.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'"></head><body><script>${safeSource}</script></body></html>`;
    document.body.appendChild(iframe);
  };

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span>{normalizedLanguage}</span>
        <div className="code-block__actions">
          <button type="button" onClick={copyCode} title="Copy code">Copy</button>
          <button
            type="button"
            onClick={runCode}
            disabled={running}
            title={canRun ? "Run JavaScript" : "Run supported JavaScript code only"}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>
      <pre className="code-block__pre"><code>{code}</code></pre>
      {output && (
        <pre className="code-block__output"><span className="code-block__output-label">Output</span>{output}</pre>
      )}
    </div>
  );
}

function MessageContent({ text, showNotice }) {
  const parts = [];
  const fence = /```([a-zA-Z0-9_+.-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = fence.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "code",
      language: match[1] || "text",
      value: match[2].replace(/^\n|\n$/g, ""),
    });
    lastIndex = fence.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (!parts.length) parts.push({ type: "text", value: text });

  return (
    <div className="chat-message__content">
      {parts.map((part, index) =>
        part.type === "code" ? (
          <CodeBlock key={`code-${index}`} code={part.value} language={part.language} showNotice={showNotice} />
        ) : (
          <div className="chat-message__text" key={`text-${index}`}>{part.value}</div>
        )
      )}
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [view, setView] = useState("chat");
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [aiMode, setAiMode] = useState("chat");
  const [modeOpen, setModeOpen] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const [libraryFiles, setLibraryFiles] = useState([]);
  const [notice, setNotice] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("verde_settings") || "{}"); } catch { return {}; }
  });
  const [researchEnabled, setResearchEnabled] = useState(() => localStorage.getItem("verde_research") !== "false");

  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const profileRef = useRef(null);
  const moreRef = useRef(null);
  const headerMoreRef = useRef(null);
  const modeRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const composerInputRef = useRef(null);

  /* =========================================================
     NOTICE
  ========================================================= */

  const showNotice = useCallback((text) => {
    setNotice(text);

    window.setTimeout(() => {
      setNotice("");
    }, 2800);
  }, []);

  /* =========================================================
     LOAD CHATS
  ========================================================= */

  const loadChats = useCallback(async () => {
    if (!getAccessToken()) {
      return;
    }

    setIsLoadingChats(true);

    try {
      const response = await apiFetch("/api/chats");

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);

        console.error("LOAD CHATS FAILED:", {
          status: response.status,
          body: errorBody,
        });

        throw new Error(
          errorBody?.detail ||
            `Could not load chats (${response.status}).`
        );
      }

      const data = await response.json();

      setChats(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("LOAD CHATS ERROR:", error);

      showNotice(
        error.message ||
          "Could not load chats."
      );
    } finally {
      setIsLoadingChats(false);
    }
  }, [showNotice]);

  /* =========================================================
     LOAD MESSAGES
  ========================================================= */

  const loadMessages = useCallback(
    async (chatId) => {
      try {
        const response = await apiFetch(
          `/api/chats/${chatId}/messages`
        );

        if (!response.ok) {
          const errorBody = await response
            .json()
            .catch(() => null);

          console.error(
            "LOAD MESSAGES FAILED:",
            {
              status: response.status,
              body: errorBody,
            }
          );

          throw new Error(
            errorBody?.detail ||
              `Could not load messages (${response.status}).`
          );
        }

        const data = await response.json();

        setMessages(
          Array.isArray(data)
            ? data.map((msg) => ({
                id: msg.id,
                text: msg.content,
                sender:
                  msg.role === "user"
                    ? "user"
                    : "assistant",
                files: [],
                createdAt: msg.created_at,
              }))
            : []
        );

        setCurrentChatId(chatId);
      } catch (error) {
        console.error(
          "LOAD MESSAGES ERROR:",
          error
        );

        showNotice(
          error.message ||
            "Could not load this chat."
        );
      }
    },
    [showNotice]
  );

  /* =========================================================
     LOAD LIBRARY
  ========================================================= */

  const loadLibrary = useCallback(async () => {
    try {
      const response = await apiFetch(
        "/api/files"
      );

      if (!response.ok) {
        const errorBody = await response
          .json()
          .catch(() => null);

        console.error(
          "LOAD LIBRARY FAILED:",
          {
            status: response.status,
            body: errorBody,
          }
        );

        throw new Error(
          errorBody?.detail ||
            `Could not load library (${response.status}).`
        );
      }

      const data = await response.json();

      setLibraryFiles(
        Array.isArray(data) ? data : []
      );
    } catch (error) {
      console.error(
        "LOAD LIBRARY ERROR:",
        error
      );

      showNotice(
        error.message ||
          "Could not load library."
      );
    }
  }, [showNotice]);

  /* =========================================================
     RESTORE LOGIN SESSION
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!getAccessToken()) {
        return;
      }

      try {
        let response = await apiFetch(
          "/api/auth/me"
        );

        if (
          !response.ok &&
          getRefreshToken()
        ) {
          const refreshed =
            await refreshAccessToken();

          if (refreshed) {
            response = await apiFetch(
              "/api/auth/me"
            );
          }
        }

        if (!response.ok) {
          clearTokens();
          return;
        }

        const me = await response.json();

        if (!cancelled) {
          setUser(normalizeUser(me));
          setView("chat");
        }
      } catch (error) {
        console.error(
          "RESTORE SESSION ERROR:",
          error
        );

        if (!cancelled) {
          clearTokens();
          setUser(null);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================
     LOAD CHATS WHEN USER IS AVAILABLE
  ========================================================= */

  useEffect(() => {
    if (user) {
      loadChats();
    }
  }, [user, loadChats]);

  /* =========================================================
     SPEECH RECOGNITION
  ========================================================= */

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(
        event.results
      )
        .map(
          (result) =>
            result[0].transcript
        )
        .join(" ");

      setMessage((previous) =>
        previous
          ? `${previous} ${transcript}`
          : transcript
      );
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, []);

  /* =========================================================
     CLOSE MENUS ON OUTSIDE CLICK
  ========================================================= */

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(
          event.target
        )
      ) {
        setProfileOpen(false);
      }

      if (
        moreRef.current &&
        !moreRef.current.contains(
          event.target
        )
      ) {
        setMoreOpen(false);
      }

      if (
        headerMoreRef.current &&
        !headerMoreRef.current.contains(
          event.target
        )
      ) {
        setHeaderMoreOpen(false);
      }

      if (
        modeRef.current &&
        !modeRef.current.contains(
          event.target
        )
      ) {
        setModeOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  /* =========================================================
     SCROLL CHAT
  ========================================================= */

  useEffect(() => {
    const container = messagesScrollRef.current;

    if (!container) {
      return;
    }

    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messages, isSending]);

  const copyPrompt = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotice("Prompt copied.");
    } catch (error) {
      console.error("COPY PROMPT ERROR:", error);
      showNotice("Could not copy the prompt.");
    }
  };

  const editPrompt = (text) => {
    setMessage(text || "");
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  /* =========================================================
     CREATE CHAT
  ========================================================= */

  const createChat = async (title) => {
    /*
      Make sure a token exists before trying
      to create the chat.
    */

    const token = getAccessToken();

    if (!token) {
      throw new Error(
        "You are not logged in. Please log in again."
      );
    }

    const response = await apiFetch(
      "/api/chats",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title:
            title?.trim() ||
            "New chat",
        }),
      }
    );

    /*
      IMPORTANT:
      Show the real backend error instead of
      hiding it behind "Could not create chat."
    */

    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(() => null);

      console.error(
        "CREATE CHAT FAILED:",
        {
          status: response.status,
          statusText:
            response.statusText,
          body: errorBody,
        }
      );

      if (response.status === 401) {
        clearTokens();
        setUser(null);

        throw new Error(
          "Your login session expired. Please log in again."
        );
      }

      throw new Error(
        errorBody?.detail ||
          `Could not create chat (${response.status}).`
      );
    }

    const chat = await response.json();

    if (!chat?.id) {
      console.error(
        "CREATE CHAT INVALID RESPONSE:",
        chat
      );

      throw new Error(
        "The server created the chat but returned an invalid response."
      );
    }

    setCurrentChatId(chat.id);

    setChats((current) => [
      chat,
      ...current.filter(
        (item) => item.id !== chat.id
      ),
    ]);

    return chat;
  };

  /* =========================================================
     UPLOAD ATTACHMENTS
  ========================================================= */

  const uploadAttachments = async () => {
    const uploaded = [];

    for (const attachment of attachments) {
      if (attachment.fileId) {
        uploaded.push(attachment.fileId);
        continue;
      }

      const formData = new FormData();

      formData.append(
        "upload",
        attachment.file
      );

      const response = await apiFetch(
        "/api/files",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorBody = await response
          .json()
          .catch(() => null);

        console.error(
          "UPLOAD FAILED:",
          {
            status: response.status,
            body: errorBody,
          }
        );

        throw new Error(
          errorBody?.detail ||
            `Upload failed: ${attachment.name}`
        );
      }

      const file =
        await response.json();

      uploaded.push(file.id);
    }

    return uploaded;
  };

  /* =========================================================
     SEND MESSAGE
  ========================================================= */

  const sendMessage = async () => {
    const text = message.trim();

    if (
      (!text &&
        attachments.length === 0) ||
      isSending
    ) {
      return;
    }

    if (!user) {
      openAuth("login");
      return;
    }

    setIsSending(true);

    try {
      /*
        Upload files first.
      */

      const fileIds =
        await uploadAttachments();

      /*
        Create a chat automatically if this
        is the first message.
      */

      let chatId = currentChatId;

      if (!chatId) {
        const title = text
          ? text.slice(0, 60)
          : "File conversation";

        const chat =
          await createChat(title);

        chatId = chat.id;
      }

      /*
        Send the actual message.
      */

      const response = await apiFetch(
        `/api/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            content:
              text ||
              "Please analyze the attached file.",
            file_ids: fileIds,
            mode: aiMode,
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response
          .json()
          .catch(() => null);

        console.error(
          "SEND MESSAGE FAILED:",
          {
            status: response.status,
            body: errorBody,
          }
        );

        throw new Error(
          errorBody?.detail ||
            `Could not send message (${response.status}).`
        );
      }

      const result =
        await response.json();

      if (!Array.isArray(result)) {
        throw new Error(
          "The server returned an invalid message response."
        );
      }

      setMessages((current) => [
        ...current,

        ...result.map((msg) => ({
          id: msg.id,
          text: msg.content,
          sender:
            msg.role === "user"
              ? "user"
              : "assistant",
          files:
            msg.role === "user"
              ? attachments.map(
                  (a) => ({
                    id: a.id,
                    name: a.name,
                  })
                )
              : [],
          createdAt:
            msg.created_at,
        })),
      ]);

      setMessage("");
      setAttachments([]);

      await loadChats();
    } catch (error) {
      console.error(
        "SEND MESSAGE ERROR:",
        error
      );

      showNotice(
        error.message ||
          "Something went wrong."
      );
    } finally {
      setIsSending(false);
    }
  };

  /* =========================================================
     ENTER KEY
  ========================================================= */

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  /* =========================================================
     NEW CHAT
  ========================================================= */

  const newChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setMessage("");
    setAttachments([]);
    setLibraryOpen(false);
    setMoreOpen(false);
    setHeaderMoreOpen(false);
  };

  /* =========================================================
     OPEN CHAT
  ========================================================= */

  const openChat = async (chat) => {
    setMoreOpen(false);
    setHeaderMoreOpen(false);
    setLibraryOpen(false);
    setMessage("");
    setAttachments([]);

    await loadMessages(chat.id);
  };

  /* =========================================================
     RENAME CHAT
  ========================================================= */

  const renameChat = async () => {
    if (!currentChatId) {
      showNotice(
        "Open a chat first."
      );
      return;
    }

    const current = chats.find(
      (chat) =>
        chat.id === currentChatId
    );

    const title = window.prompt(
      "New chat name:",
      current?.title ||
        "New chat"
    );

    if (!title?.trim()) {
      return;
    }

    try {
      const response = await apiFetch(
        `/api/chats/${currentChatId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
          }),
        }
      );

      if (!response.ok) {
        const errorBody =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          errorBody?.detail ||
            `Could not rename chat (${response.status}).`
        );
      }

      const updated =
        await response.json();

      setChats((items) =>
        items.map((chat) =>
          chat.id === updated.id
            ? updated
            : chat
        )
      );

      showNotice("Chat renamed.");
    } catch (error) {
      showNotice(
        error.message ||
          "Could not rename chat."
      );
    }

    setMoreOpen(false);
    setHeaderMoreOpen(false);
  };

  /* =========================================================
     DELETE CHAT
  ========================================================= */

  const deleteChatById = async (chatId) => {
    if (!chatId) {
      showNotice("Open a chat first.");
      return;
    }

    if (!window.confirm("Delete this chat?")) {
      return;
    }

    try {
      const response = await apiFetch(
        `/api/chats/${chatId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.detail ||
            `Could not delete chat (${response.status}).`
        );
      }

      setChats((items) => items.filter((chat) => chat.id !== chatId));

      if (chatId === currentChatId) {
        newChat();
      }

      showNotice("Chat deleted.");
    } catch (error) {
      showNotice(error.message || "Could not delete chat.");
    }

    setMoreOpen(false);
    setHeaderMoreOpen(false);
  };

  const deleteCurrentChat = () => deleteChatById(currentChatId);

  /* =========================================================
     UPLOAD CLICK
  ========================================================= */

  const handleUploadClick = () => {
    if (!user) {
      openAuth("login");
      return;
    }

    fileInputRef.current?.click();
  };

  /* =========================================================
     FILE SELECTION
  ========================================================= */

  const handleFilesSelected = (
    event
  ) => {
    const files = Array.from(
      event.target.files || []
    );

    if (!files.length) {
      return;
    }

    setAttachments((current) => [
      ...current,

      ...files.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        file,
      })),
    ]);

    event.target.value = "";
  };

  /* =========================================================
     REMOVE ATTACHMENT
  ========================================================= */

  const removeAttachment = (
    id
  ) => {
    setAttachments((current) =>
      current.filter(
        (item) => item.id !== id
      )
    );
  };

  /* =========================================================
     VOICE
  ========================================================= */

  const handleVoiceClick = () => {
    const recognition =
      recognitionRef.current;

    if (!recognition) {
      showNotice(
        "Voice input is not supported in this browser. Try Chrome."
      );
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error(
        "VOICE ERROR:",
        error
      );
    }
  };

  /* =========================================================
     AUTH
  ========================================================= */

  const openAuth = (mode) => {
    setAuthMode(mode);
    setView("auth");
    setProfileOpen(false);
  };

  const handleAuthenticated = async (
    authenticatedUser
  ) => {
    /*
      AuthScreen can return:

      {
        access_token,
        refresh_token,
        user
      }

      or a user object.
    */

    if (
      authenticatedUser?.access_token
    ) {
      saveTokens(
        authenticatedUser
      );
    }

    const candidate =
      authenticatedUser?.user ||
      authenticatedUser?.profile ||
      authenticatedUser;

    let finalUser =
      normalizeUser(candidate);

    /*
      Get the official user from backend.
    */

    if (getAccessToken()) {
      try {
        const response =
          await apiFetch(
            "/api/auth/me"
          );

        if (response.ok) {
          finalUser =
            normalizeUser(
              await response.json()
            );
        }
      } catch (error) {
        console.error(
          "AUTH USER FETCH ERROR:",
          error
        );
      }
    }

    /*
      If we still don't have a user,
      don't pretend authentication succeeded.
    */

    if (!finalUser) {
      clearTokens();

      showNotice(
        "Login failed. Please try again."
      );

      return;
    }

    setUser(finalUser);
    setView("chat");

    await loadChats();
  };

  /* =========================================================
     LOGOUT
  ========================================================= */

  const handleLogout = () => {
    clearTokens();

    setUser(null);
    setCurrentChatId(null);
    setMessages([]);
    setChats([]);
    setAttachments([]);
    setMessage("");

    setProfileOpen(false);
    setMoreOpen(false);
    setHeaderMoreOpen(false);
    setLibraryOpen(false);

    showNotice(
      "You have been logged out."
    );
  };

  /* =========================================================
     SHARE
  ========================================================= */

  const shareChat = async () => {
    setHeaderMoreOpen(false);
    const current = chats.find(
      (chat) =>
        chat.id === currentChatId
    );

    const text = messages
      .map(
        (msg) =>
          `${
            msg.sender === "user"
              ? "You"
              : "Verde"
          }: ${msg.text}`
      )
      .join("\n\n");

    const shareData = {
      title:
        current?.title ||
        "Verde chat",
      text:
        text ||
        "A conversation in Verde.",
    };

    try {
      if (navigator.share) {
        await navigator.share(
          shareData
        );
      } else if (
        navigator.clipboard
      ) {
        await navigator.clipboard.writeText(
          shareData.text
        );

        showNotice(
          "Conversation copied to clipboard."
        );
      } else {
        showNotice(
          "Sharing is not available in this browser."
        );
      }
    } catch (error) {
      console.error(
        "SHARE ERROR:",
        error
      );
    }
  };

  /* =========================================================
     LIBRARY
  ========================================================= */

  const openLibrary = async () => {
    const newState = !libraryOpen;

    setLibraryOpen(newState);
    setMoreOpen(false);

    if (newState && user) {
      await loadLibrary();
    }
  };

  const togglePinned = async (chat) => {
    try {
      const response = await apiFetch(`/api/chats/${chat.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: chat.title, pinned: !chat.pinned, folder: chat.folder || "" }),
      });
      if (!response.ok) throw new Error("Could not update chat.");
      const updated = await response.json();
      setChats(items => items.map(item => item.id === updated.id ? updated : item));
    } catch {
      // Backward-compatible fallback for older databases.
      const key = `verde_pinned_${chat.id}`;
      const next = localStorage.getItem(key) !== "true";
      localStorage.setItem(key, String(next));
      setChats(items => items.map(item => item.id === chat.id ? { ...item, pinned: next } : item));
    }
  };

  const setChatFolder = async (chat) => {
    const folder = window.prompt("Project / folder name (leave blank for General):", chat.folder || "");
    if (folder === null) return;
    try {
      const response = await apiFetch(`/api/chats/${chat.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: chat.title, pinned: !!chat.pinned, folder: folder.trim() }),
      });
      if (!response.ok) throw new Error("Could not organize chat.");
      const updated = await response.json();
      setChats(items => items.map(item => item.id === updated.id ? updated : item));
    } catch (error) { showNotice(error.message || "Could not organize chat."); }
  };

  const runQuickAction = async (action) => {
    const prompts = {
      simpler: "Explain your last answer in simpler language.",
      example: "Give a practical example based on your last answer.",
      deeper: "Go deeper into the most important part of your last answer.",
      quiz: "Quiz me on the topic you just explained. Ask one question at a time.",
    };
    if (!messages.length) return;
    setMessage(prompts[action] || prompts.simpler);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  };

  const saveSettings = (next) => {
    setSettings(next);
    localStorage.setItem("verde_settings", JSON.stringify(next));
  };

  const filteredChats = chats
    .filter(chat => chat.title.toLowerCase().includes(chatSearch.toLowerCase()))
    .sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned));


  /* =========================================================
     INITIALS
  ========================================================= */

  const initials = user
    ? (user.name || "V")
        .split(" ")
        .map(
          (part) => part[0]
        )
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  /* =========================================================
     AUTH SCREEN
  ========================================================= */

  if (view === "auth") {
    return (
      <AuthScreen
        initialMode={authMode}
        onAuthenticated={
          handleAuthenticated
        }
        onBack={() =>
          setView("chat")
        }
      />
    );
  }

  /* =========================================================
     MAIN UI
  ========================================================= */

  return (
    <div className="shell">
      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside className="rail">
        <div className="rail-brand">
          <div className="rail-brand__badge">
            <svg
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M3 4L11.2 20C11.55 20.7 12.45 20.7 12.8 20L21 4"
                stroke="white"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M8 4L11.5 11.5"
                stroke="white"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <span className="rail-brand__label">
            Verde
          </span>
        </div>

        <nav className="rail-menu">
          {/* NEW CHAT */}

          <button
            className="rail-menu__link"
            data-primary="true"
            onClick={newChat}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>

            New chat
          </button>

          {/* IMAGE */}

          <button
            className="rail-menu__link"
            onClick={
              handleUploadClick
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="3"
              />

              <circle
                cx="8.5"
                cy="8.5"
                r="1.5"
              />

              <path d="M21 15l-5-5L5 21" />
            </svg>

            Image
          </button>

          {/* LIBRARY */}

          <button
            className="rail-menu__link"
            onClick={openLibrary}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />

              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>

            Library
          </button>

          {/* MORE */}

          <div
            className="rail-more-wrap"
            ref={moreRef}
          >
            <button
              className="rail-menu__link"
              onClick={() =>
                setMoreOpen(
                  (open) => !open
                )
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle
                  cx="5"
                  cy="12"
                  r="1.6"
                />

                <circle
                  cx="12"
                  cy="12"
                  r="1.6"
                />

                <circle
                  cx="19"
                  cy="12"
                  r="1.6"
                />
              </svg>

              More
            </button>

            {moreOpen && (
              <div className="rail-account__menu">
                <button
                  className="rail-account__menu-item"
                  onClick={
                    renameChat
                  }
                >
                  Rename chat
                </button>

                <button className="rail-account__menu-item" onClick={() => currentChatId && togglePinned(chats.find(c => c.id === currentChatId))}>Pin / unpin chat</button>
                <button className="rail-account__menu-item" onClick={() => currentChatId && setChatFolder(chats.find(c => c.id === currentChatId))}>Add to project</button>
                <button className="rail-account__menu-item" onClick={() => setSettingsOpen(true)}>Settings</button>
                <button className="rail-account__menu-item" onClick={deleteCurrentChat}>Delete chat</button>
              </div>
            )}
          </div>
        </nav>

        <div></div>

        {/* RECENTS */}

        <div className="rail-history">
          <div className="rail-history__heading rail-history__heading--row">
            <span>Recents</span>
            <button type="button" className="rail-history__clear" onClick={() => setChatSearch("")}>Clear</button>
          </div>
          <input className="rail-chat-search" value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search chats…" aria-label="Search chats" />

          {isLoadingChats && (
            <div className="rail-history__entry">
              Loading...
            </div>
          )}

          {!isLoadingChats &&
            chats.length === 0 && (
              <div className="rail-history__entry">
                No chats yet
              </div>
            )}

          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`rail-history__row ${chat.id === currentChatId ? "is-active" : ""}`}
            >
              <button
                className="rail-history__entry"
                onClick={() => openChat(chat)}
                title={chat.title}
              >
                {chat.title}
              </button>
              <button
                type="button"
                className="rail-history__delete"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteChatById(chat.id);
                }}
                title={`Delete ${chat.title}`}
                aria-label={`Delete ${chat.title}`}
              >
                ×
              </button>
              <button type="button" className="rail-history__pin" onClick={(event) => { event.stopPropagation(); togglePinned(chat); }} title={chat.pinned ? "Unpin chat" : "Pin chat"}>{chat.pinned ? "★" : "☆"}</button>
            </div>
          ))}
        </div>

        {/* ACCOUNT */}

        {user ? (
          <div
            className="rail-account"
            ref={profileRef}
          >
            <button
              className="rail-account__trigger"
              onClick={() =>
                setProfileOpen(
                  (open) => !open
                )
              }
            >
              <div className="rail-account__avatar">
                {initials}
              </div>

              <span className="rail-account__name">
                {user.name}
              </span>

              <svg
                className="rail-account__chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {profileOpen && (
              <div className="rail-account__menu">
                <button
                  className="rail-account__menu-item"
                  onClick={
                    handleLogout
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2.5 0 0 1 2-2h4" />

                    <path d="M16 17l5-5-5-5" />

                    <path d="M21 12H9" />
                  </svg>

                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rail-auth-buttons">
            <button
              className="rail-auth-btn"
              onClick={() =>
                openAuth("login")
              }
            >
              Log in
            </button>

            <button
              className="rail-auth-btn rail-auth-btn--primary"
              onClick={() =>
                openAuth("register")
              }
            >
              Sign up
            </button>
          </div>
        )}
      </aside>

      {/* =====================================================
          MAIN PANE
      ===================================================== */}

      <div className="pane">
        {/* HEADER */}

        <header className="pane-header">
          {/* AI MODE */}
          <div className="ai-mode-wrap" ref={modeRef}>
            <button
              className="pane-header__btn ai-mode-trigger"
              aria-haspopup="menu"
              aria-expanded={modeOpen}
              onClick={() => setModeOpen((open) => !open)}
              title="Choose how Verde should respond"
            >
              <span className="ai-mode-trigger__icon">
                {AI_MODES.find((mode) => mode.id === aiMode)?.icon || "✦"}
              </span>
              {AI_MODES.find((mode) => mode.id === aiMode)?.label || "General"}
              <span className="ai-mode-trigger__chevron">⌄</span>
            </button>

            {modeOpen && (
              <div className="ai-mode-menu" role="menu">
                <div className="ai-mode-menu__heading">Verde AI mode</div>
                {AI_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`ai-mode-option ${aiMode === mode.id ? "is-active" : ""}`}
                    role="menuitem"
                    onClick={() => {
                      setAiMode(mode.id);
                      setModeOpen(false);
                    }}
                  >
                    <span className="ai-mode-option__icon">{mode.icon}</span>
                    <span className="ai-mode-option__copy">
                      <strong>{mode.label}</strong>
                      <small>{mode.description}</small>
                    </span>
                    {aiMode === mode.id && (
                      <span className="ai-mode-option__check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!user && (
            <>
              <button
                className="pane-header__btn"
                onClick={() =>
                  openAuth("login")
                }
              >
                Log in
              </button>

              <button
                className="pane-header__btn"
                data-emphasis="true"
                onClick={() =>
                  openAuth("register")
                }
              >
                Sign up
              </button>
            </>
          )}

          <button
            className="pane-header__btn"
            onClick={shareChat}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle
                cx="18"
                cy="5"
                r="3"
              />

              <circle
                cx="6"
                cy="12"
                r="3"
              />

              <circle
                cx="18"
                cy="19"
                r="3"
              />

              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>

            Share
          </button>

          <div
            className="header-more-wrap"
            ref={headerMoreRef}
          >
            <button
              className="pane-header__btn"
              onClick={() => setHeaderMoreOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={headerMoreOpen}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle
                  cx="5"
                  cy="12"
                  r="1.6"
                />

                <circle
                  cx="12"
                  cy="12"
                  r="1.6"
                />

                <circle
                  cx="19"
                  cy="12"
                  r="1.6"
                />
              </svg>

              More
            </button>

            {headerMoreOpen && (
              <div className="header-more-menu" role="menu">
                <button type="button" onClick={newChat}>
                  <span>＋</span> New chat
                </button>
                <button type="button" onClick={renameChat}>
                  <span>✎</span> Rename chat
                </button>
                <button type="button" onClick={shareChat}>
                  <span>↗</span> Share chat
                </button>
                <button type="button" onClick={() => setSettingsOpen(true)}><span>⚙</span> Settings</button>
                <button type="button" className="is-danger" onClick={deleteCurrentChat}>
                  <span>⌫</span> Delete chat
                </button>
              </div>
            )}
          </div>
        </header>

        {/* HERO / CHAT */}

        <section className={`pane-hero ${messages.length ? "pane-hero--chat" : ""}`}>
          {messages.length === 0 ? (
            <>
              <div className="pane-hero__badge">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M3 4L11.2 20C11.55 20.7 12.45 20.7 12.8 20L21 4"
                    stroke="white"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <path
                    d="M8 4L11.5 11.5"
                    stroke="white"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <h1 className="pane-hero__title">
                What can I help with today?
              </h1>

              <p className="pane-hero__subtitle">
                Ask a question, share a
                file, or start a project —
                everything stays right
                here in the conversation.
              </p>
            </>
          ) : (
            <div className="chat-scroll-area" ref={messagesScrollRef}>
              <div className="chat-messages">
                {messages.map((msg) => (
                  <article
                    key={msg.id}
                    className={`chat-message ${msg.sender === "user" ? "chat-message--user" : "chat-message--assistant"}`}
                  >
                    <div className="chat-message__bubble">
                      {msg.files?.length > 0 && (
                        <div className="chat-message__files">
                          {msg.files.map((file) => (
                            <span className="chat-file-chip" key={file.id}>
                              📎 {file.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.text && (
                        <MessageContent text={msg.text} showNotice={showNotice} />
                      )}
                    </div>

                    {msg.sender === "assistant" && msg.text && (
                      <div className="chat-message__actions chat-message__actions--assistant">
                        <button type="button" className="chat-message__action" onClick={() => copyPrompt(msg.text)}>Copy</button>
                        <button type="button" className="chat-message__action" onClick={() => runQuickAction("simpler")}>Explain simpler</button>
                        <button type="button" className="chat-message__action" onClick={() => runQuickAction("example")}>Example</button>
                        <button type="button" className="chat-message__action" onClick={() => runQuickAction("deeper")}>Go deeper</button>
                        <button type="button" className="chat-message__action" onClick={() => runQuickAction("quiz")}>Quiz me</button>
                      </div>
                    )}

                    {msg.sender === "user" && msg.text && (
                      <div className="chat-message__actions">
                        <button
                          type="button"
                          className="chat-message__action"
                          onClick={() => copyPrompt(msg.text)}
                          title="Copy prompt"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="8" y="8" width="12" height="12" rx="2" />
                            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                          </svg>
                          Copy
                        </button>
                        <button
                          type="button"
                          className="chat-message__action"
                          onClick={() => editPrompt(msg.text)}
                          title="Edit prompt"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                          </svg>
                          Edit
                        </button>
                      </div>
                    )}
                  </article>
                ))}

                {isSending && (
                  <div className="chat-message chat-message--assistant">
                    <div className="chat-message__bubble chat-message__bubble--thinking">
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-label">Verde is thinking…</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} aria-hidden="true" />
              </div>
            </div>
          )}
        </section>

        {/* LIBRARY */}

        {libraryOpen && (
          <div
            style={{
              position:
                "absolute",
              left: "24px",
              bottom: "130px",
              width:
                "min(420px, calc(100% - 48px))",
              maxHeight: "300px",
              overflowY:
                "auto",
              padding: "16px",
              borderRadius:
                "16px",
              background:
                "#10284f",
              border:
                "1px solid rgba(255,255,255,.08)",
              zIndex: 10,
            }}
          >
            <strong>
              Library
            </strong>

            {libraryFiles.length ===
            0 ? (
              <p
                style={{
                  opacity: 0.7,
                }}
              >
                No uploaded files
                yet.
              </p>
            ) : (
              libraryFiles.map(
                (file) => (
                  <div
                    key={file.id}
                    style={{
                      padding:
                        "10px 0",
                      borderBottom:
                        "1px solid rgba(255,255,255,.06)",
                    }}
                  >
                    📎{" "}
                    {
                      file.original_name
                    }
                  </div>
                )
              )
            )}
          </div>
        )}

        {/* ===================================================
            COMPOSER
        =================================================== */}

        <div className="pane-composer">
          <div className="composer-box">
            <div className="composer-mode-line">
              <span className="composer-mode-line__dot">✦</span>
              <span>
                {AI_MODES.find((mode) => mode.id === aiMode)?.label || "General"} mode
              </span>
              <button
                type="button"
                className="composer-mode-line__change"
                onClick={() => setModeOpen(true)}
              >
                Change
              </button>
            </div>

            {attachments.length >
              0 && (
              <div className="composer-box__attachments">
                {attachments.map(
                  (attachment) => (
                    <span
                      className="attachment-chip"
                      key={
                        attachment.id
                      }
                    >
                      {
                        attachment.name
                      }

                      <button
                        type="button"
                        className="attachment-chip__remove"
                        onClick={() =>
                          removeAttachment(
                            attachment.id
                          )
                        }
                        aria-label={`Remove ${attachment.name}`}
                      >
                        ×
                      </button>
                    </span>
                  )
                )}
              </div>
            )}

            <div className="composer-box__row">
              <input
                ref={
                  fileInputRef
                }
                type="file"
                multiple
                style={{
                  display: "none",
                }}
                onChange={
                  handleFilesSelected
                }
              />

              {/* PLUS */}

              <button
                className="composer-box__plus"
                aria-label="Add attachment"
                onClick={
                  handleUploadClick
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>

              {/* MESSAGE INPUT */}

              <input
                ref={composerInputRef}
                className="composer-box__field"
                type="text"
                placeholder={
                  user
                    ? "Ask anything"
                    : "Log in to start chatting"
                }
                value={message}
                onChange={(event) =>
                  setMessage(
                    event.target
                      .value
                  )
                }
                onKeyDown={
                  handleKeyDown
                }
              />

              <div className="composer-box__tools">
                {/* UPLOAD */}

                <button
                  className="tool-btn"
                  aria-label="Upload file"
                  title="Upload"
                  onClick={
                    handleUploadClick
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 16V4M12 4l-4.5 4.5M12 4l4.5 4.5" />

                    <path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
                  </svg>
                </button>

                {/* VOICE */}

                <button
                  className="tool-btn"
                  data-active={
                    isListening
                      ? "true"
                      : undefined
                  }
                  aria-label="Voice input"
                  title={
                    isListening
                      ? "Listening… click to stop"
                      : "Voice"
                  }
                  onClick={
                    handleVoiceClick
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="9"
                      y="2.5"
                      width="6"
                      height="11"
                      rx="3"
                    />

                    <path d="M5 11a7 7 0 0 0 14 0" />

                    <path d="M12 18v3.5M9 21.5h6" />
                  </svg>
                </button>

                {/* SEND */}

                <button
                  className="tool-btn"
                  data-send="true"
                  aria-label="Send message"
                  title="Send"
                  onClick={
                    sendMessage
                  }
                  disabled={
                    isSending
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {settingsOpen && (
          <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Verde settings">
            <div className="settings-card">
              <div className="settings-card__head"><div><h2>Verde settings</h2><p>Personalize how Verde feels and responds.</p></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></div>
              <label className="settings-field"><span>Response style</span><select value={settings.style || "balanced"} onChange={e => saveSettings({...settings, style:e.target.value})}><option value="balanced">Balanced</option><option value="concise">Concise</option><option value="detailed">Detailed</option></select></label>
              <label className="settings-field"><span>Language</span><select value={settings.language || "English"} onChange={e => saveSettings({...settings, language:e.target.value})}><option>English</option><option>French</option><option>Kinyarwanda</option></select></label>
              <label className="settings-toggle"><input type="checkbox" checked={researchEnabled} onChange={e => { setResearchEnabled(e.target.checked); localStorage.setItem("verde_research", String(e.target.checked)); }} /><span><strong>Web research</strong><small>Allow Research mode to use current web sources.</small></span></label>
              <label className="settings-toggle"><input type="checkbox" checked={settings.reduceMotion !== false} onChange={e => saveSettings({...settings, reduceMotion:e.target.checked})} /><span><strong>Comfortable motion</strong><small>Use subtle interface animations.</small></span></label>
              <div className="settings-actions"><button type="button" onClick={() => setSettingsOpen(false)}>Done</button></div>
            </div>
          </div>
        )}

        {/* NOTICE */}

        {notice && (
          <div
            style={{
              position: "fixed",
              left: "50%",
              bottom: "24px",
              transform:
                "translateX(-50%)",
              padding:
                "10px 16px",
              borderRadius:
                "10px",
              background:
                "#10284f",
              border:
                "1px solid rgba(255,255,255,.12)",
              zIndex: 100,
            }}
          >
            {notice}
          </div>
        )}

        {/* FOOTNOTE */}

        <p className="pane-footnote">
          AI can make mistakes. Check
          important information.
        </p>
      </div>
    </div>
  );
}