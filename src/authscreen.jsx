import React, { useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function AuthScreen({
  initialMode = "login",
  onAuthenticated,
  onBack,
}) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const resetFields = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const switchMode = (nextMode) => {
    setError("");
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMode(nextMode);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!isLogin) {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      // REGISTER
      if (!isLogin) {
        const registerResponse = await fetch(
          `${API_BASE}/api/auth/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              display_name: name.trim(),
              email: cleanEmail,
              password,
            }),
          }
        );

        const registerData = await registerResponse.json();

        if (!registerResponse.ok) {
          throw new Error(
            registerData?.detail || "Unable to create your account."
          );
        }
      }

      // LOGIN
      const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      const loginData = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(loginData?.detail || "Invalid email or password.");
      }

      if (!loginData.access_token || !loginData.refresh_token) {
        throw new Error(
          "Login succeeded, but the server did not return tokens."
        );
      }

      // Get the authenticated user's real profile
      const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${loginData.access_token}`,
        },
      });

      const meData = await meResponse.json();

      if (!meResponse.ok) {
        throw new Error(
          meData?.detail || "Could not load your account."
        );
      }

      // Send everything to App.jsx
      onAuthenticated({
        access_token: loginData.access_token,
        refresh_token: loginData.refresh_token,
        user: meData,
      });
    } catch (err) {
      setError(
        err.message || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {onBack && (
          <button
            type="button"
            className="auth-back"
            onClick={onBack}
            aria-label="Back to chat"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        )}

        <div className="auth-brand">
          <div className="auth-brand__badge">
            <svg viewBox="0 0 24 24" fill="none">
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

          <span className="auth-brand__label">Verde</span>
        </div>

        <h1 className="auth-title">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>

        <p className="auth-subtitle">
          {isLogin
            ? "Log in to continue your conversations."
            : "Sign up to start chatting with Verde."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <label className="auth-field">
              <span className="auth-field__label">Full name</span>

              <input
                className="auth-field__input"
                type="text"
                placeholder="Jordan Verde"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </label>
          )}

          <label className="auth-field">
            <span className="auth-field__label">Email</span>

            <input
              className="auth-field__input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="auth-field">
            <span className="auth-field__label">Password</span>

            <input
              className="auth-field__input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>

          {!isLogin && (
            <label className="auth-field">
              <span className="auth-field__label">
                Confirm password
              </span>

              <input
                className="auth-field__input"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? isLogin
                ? "Logging in..."
                : "Creating account..."
              : isLogin
              ? "Log in"
              : "Sign up"}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin
            ? "Don't have an account?"
            : "Already have an account?"}{" "}

          <button
            type="button"
            className="auth-switch__link"
            onClick={() =>
              switchMode(isLogin ? "register" : "login")
            }
            disabled={loading}
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}