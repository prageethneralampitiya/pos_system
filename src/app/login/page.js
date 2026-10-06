"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [shopName, setShopName] = useState("PRINT X Advertising");

  // Specific logo for login front page
  const frontPageLogo = "/login-logo.png";

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push("/dashboard");
      }
    }
    checkUser();

    async function loadShopBranding() {
      try {
        const { data } = await supabase
          .from("shop_settings")
          .select("settings")
          .eq("id", "default")
          .single();
        if (data?.settings) {
          if (data.settings.name && data.settings.name.trim() !== "PRINT X") {
            setShopName(data.settings.name);
          } else {
            setShopName("PRINT X Advertising");
          }
        }
      } catch (_) {
        try {
          const stored = localStorage.getItem("printx_shop_settings");
          if (stored) {
            const s = JSON.parse(stored);
            if (s.name && s.name.trim() !== "PRINT X") setShopName(s.name);
          }
        } catch (_) {}
      }
    }
    loadShopBranding();
  }, [router]);

  const handleAuthAction = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    let email = usernameOrEmail.trim();
    if (!email.includes("@")) {
      email = `${email.toLowerCase()}@printx.lk`;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (password === "1234" || password === "123456") {
        localStorage.setItem("printx_must_change_password", "true");
      } else {
        localStorage.removeItem("printx_must_change_password");
      }

      router.push("/dashboard");
    } catch (err) {
      setErrorMsg(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      {/* Background Layers */}
      <div className="login-bg-layer" />
      <div className="login-gradient-overlay" />
      <div className="ambient-glow-left" />
      <div className="ambient-glow-right" />

      {/* Main Container */}
      <main className="login-main-container">
        {/* Left Side: Desktop Welcome Banner */}
        <section className="login-left-pane">
          <h2 className="welcome-title">Welcome to our Billing Portal</h2>
          <p className="welcome-subtitle">
            Point of Sale, instant billing &amp; customer order management system.
          </p>
          <div className="status-badge">
            <span className="status-pulse-dot" />
            <span>Register Ready &amp; Connected</span>
          </div>
        </section>

        {/* Center: Login Card with Mobile Header */}
        <section className="login-center-pane">
          {/* Mobile-only brand header */}
          <div className="mobile-brand-header">
            <div className="mobile-logo-ring">
              <img
                src={frontPageLogo}
                alt={shopName}
                className="mobile-logo-img"
              />
            </div>
            <h2 className="mobile-shop-title">{shopName}</h2>
            <p className="mobile-shop-tagline">Welcome to our Billing Portal</p>
          </div>

          <div className="glass-panel-elevated login-card animate-fade-in">
            <div className="card-header">
              <h1 className="card-title">Sign In to POS</h1>
              <p className="card-subtitle">
                Enter your credentials to access the register
              </p>
            </div>

            <form onSubmit={handleAuthAction} className="login-form">
              {errorMsg && (
                <div className="alert alert-error">
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="alert alert-success">
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="form-group">
                <label className="input-label">Username or Email</label>
                <div className="input-field-wrapper">
                  <User size={18} className="input-icon" />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. staff01 or admin@printx.lk"
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">Password</label>
                <div className="input-field-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input-field password-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="toggle-password-btn"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn submit-btn"
                style={{
                  background: "linear-gradient(135deg, #e11d48 0%, #be123c 55%, #9f1239 100%)",
                  boxShadow: "0 10px 25px -5px rgba(225, 29, 72, 0.5), 0 0 15px rgba(225, 29, 72, 0.2)",
                  color: "#ffffff",
                  border: "none",
                }}
                disabled={loading}
              >
                <span>{loading ? "Authenticating..." : "Sign In to POS"}</span>
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="card-footer">
              <ShieldCheck size={14} color="var(--secondary)" />
              <span>Protected by {shopName} Secure Gateway</span>
            </div>
          </div>
        </section>

        {/* Right Side: Desktop Shop Logo Showcase on Dark Matching Screen */}
        <section className="login-right-pane">
          <div className="logo-pedestal">
            <div className="logo-frame">
              <img
                src={frontPageLogo}
                alt={`${shopName} Logo`}
                className="showcase-logo-img"
              />
            </div>
            <h3 className="showcase-shop-name">{shopName}</h3>
            <p className="showcase-tagline">Creative Print &amp; Design POS</p>
            <div className="system-status-pill">
              <span className="status-indicator-dot" />
              <span>System Online • 2026</span>
            </div>
          </div>
        </section>
      </main>

      <style jsx global>{`
        .login-page-wrapper {
          position: relative;
          width: 100vw;
          min-height: 100vh;
          background-color: #07090d;
          overflow-x: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-bg-layer {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: 60%;
          background-image: url('/login-bg.jpg');
          background-size: cover;
          background-position: left center;
          background-repeat: no-repeat;
          z-index: 0;
          filter: brightness(0.95) contrast(1.05);
        }

        .login-gradient-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          background:
            linear-gradient(to right, rgba(7, 9, 13, 0.25) 0%, rgba(7, 9, 13, 0.45) 25%, rgba(7, 9, 13, 0.82) 42%, #07090d 60%, #07090d 100%),
            linear-gradient(to bottom, rgba(7, 9, 13, 0.6) 0%, transparent 15%, transparent 85%, rgba(7, 9, 13, 0.7) 100%);
        }

        .ambient-glow-left {
          position: absolute;
          top: 30%;
          left: 15%;
          width: 450px;
          height: 450px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(250, 204, 21, 0.08) 0%, transparent 70%);
          z-index: 2;
          pointer-events: none;
        }

        .ambient-glow-right {
          position: absolute;
          top: 40%;
          right: 12%;
          width: 550px;
          height: 550px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, rgba(99, 102, 241, 0.1) 40%, transparent 70%);
          z-index: 2;
          pointer-events: none;
        }

        .login-main-container {
          position: relative;
          z-index: 3;
          width: 100%;
          max-width: 1480px;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 40px 48px;
          gap: 36px;
          box-sizing: border-box;
        }

        .login-left-pane {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 380px;
          padding: 24px 0;
        }

        .welcome-title {
          font-size: 36px;
          font-weight: 800;
          line-height: 1.2;
          color: #ffffff;
          text-shadow: 0 2px 20px rgba(0, 0, 0, 0.8);
          letter-spacing: -0.02em;
        }

        .welcome-subtitle {
          font-size: 15px;
          color: rgba(255, 255, 255, 0.75);
          line-height: 1.6;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          font-weight: 500;
        }

        .status-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 10px #22c55e;
          animation: pulseDot 2s infinite ease-in-out;
        }

        .login-center-pane {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
        }

        .mobile-brand-header {
          display: none;
        }

        .login-card {
          width: 100%;
          max-width: 430px;
          padding: 40px 36px;
          border-radius: 22px;
          background: rgba(13, 17, 24, 0.84);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 30px 70px -15px rgba(0, 0, 0, 0.9), 0 0 45px rgba(225, 29, 72, 0.12);
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .card-header {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .card-title {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.01em;
        }

        .card-subtitle {
          color: var(--text-muted);
          font-size: 13.5px;
          line-height: 1.4;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .input-label {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .input-field-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: var(--text-subtle);
          pointer-events: none;
        }

        .input-field-wrapper .input-field {
          width: 100%;
          height: 48px;
          padding-left: 42px;
          padding-right: 16px;
          background: rgba(22, 27, 36, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--text-main);
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .input-field-wrapper .input-field:focus {
          border-color: #f43f5e;
          box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.2);
        }

        .password-input {
          padding-right: 44px !important;
        }

        .toggle-password-btn {
          position: absolute;
          right: 12px;
          background: transparent;
          border: none;
          color: var(--text-subtle);
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;
        }

        .toggle-password-btn:hover {
          color: var(--text-main);
        }

        button.submit-btn {
          width: 100%;
          height: 48px;
          margin-top: 6px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #ffffff !important;
          border: none !important;
          background: linear-gradient(135deg, #e11d48 0%, #be123c 55%, #9f1239 100%) !important;
          box-shadow: 0 10px 25px -5px rgba(225, 29, 72, 0.5), 0 0 15px rgba(225, 29, 72, 0.2) !important;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        button.submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #f43f5e 0%, #e11d48 55%, #be123c 100%) !important;
          box-shadow: 0 12px 30px -5px rgba(225, 29, 72, 0.65), 0 0 22px rgba(225, 29, 72, 0.3) !important;
          transform: translateY(-1px);
        }

        button.submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .alert {
          padding: 11px 14px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.4;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .alert-success {
          background: rgba(34, 197, 94, 0.12);
          color: #86efac;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 11.5px;
          color: var(--text-subtle);
          letter-spacing: 0.03em;
          margin-top: 4px;
          text-align: center;
        }

        .login-right-pane {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .logo-pedestal {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 16px;
          padding: 36px 32px;
          border-radius: 24px;
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.04) 0%, rgba(10, 13, 18, 0.6) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7), 0 0 35px rgba(239, 68, 68, 0.08), 0 0 35px rgba(99, 102, 241, 0.1);
          max-width: 400px;
          width: 100%;
        }

        .logo-frame {
          width: 100%;
          max-width: 330px;
          min-height: 110px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px 24px;
          box-shadow: inset 0 2px 10px rgba(255, 255, 255, 0.05), 0 15px 35px rgba(0, 0, 0, 0.5);
        }

        .showcase-logo-img {
          width: 100%;
          max-height: 85px;
          object-fit: contain;
          filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6));
        }

        .showcase-shop-name {
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.02em;
          margin-top: 4px;
        }

        .showcase-tagline {
          font-size: 13.5px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .system-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 9999px;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.28);
          color: hsl(244, 75%, 75%);
          font-size: 12px;
          fontWeight: 600;
          margin-top: 8px;
        }

        .status-indicator-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: hsl(190, 90%, 50%);
          box-shadow: 0 0 8px hsl(190, 90%, 50%);
        }

        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        /* Responsive rules */
        @media (max-width: 1024px) {
          .login-bg-layer {
            width: 100%;
            filter: brightness(0.7) contrast(1.05);
          }
          .login-gradient-overlay {
            background: linear-gradient(180deg, rgba(7, 9, 13, 0.72) 0%, rgba(7, 9, 13, 0.92) 50%, #07090d 100%);
          }
          .login-main-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            gap: 20px;
            min-height: 100vh;
          }
          .login-left-pane,
          .login-right-pane {
            display: none !important;
          }
          .mobile-brand-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-bottom: 20px;
            gap: 8px;
          }
          .mobile-logo-ring {
            width: 100%;
            max-width: 240px;
            min-height: 68px;
            border-radius: 16px;
            background: rgba(13, 17, 24, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.2);
            margin-bottom: 4px;
          }
          .mobile-logo-img {
            width: 100%;
            max-height: 52px;
            object-fit: contain;
          }
          .mobile-shop-title {
            font-size: 22px;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: 0.02em;
          }
          .mobile-shop-tagline {
            font-size: 13.5px;
            color: var(--text-muted);
            line-height: 1.4;
          }
          .login-card {
            width: 100%;
            max-width: 420px;
            padding: 34px 26px;
          }
        }

        @media (max-width: 480px) {
          .login-main-container {
            padding: 24px 14px;
          }
          .login-card {
            padding: 28px 18px;
            border-radius: 18px;
            gap: 20px;
          }
          .card-title {
            font-size: 23px;
          }
          .card-subtitle {
            font-size: 12.5px;
          }
          .mobile-logo-ring {
            max-width: 210px;
            min-height: 60px;
          }
          .mobile-shop-title {
            font-size: 20px;
          }
          .mobile-shop-tagline {
            font-size: 12.5px;
          }
        }
      `}</style>
    </div>
  );
}
