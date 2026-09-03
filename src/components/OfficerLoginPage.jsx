import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

export default function OfficerLoginPage({ onLoginSuccess }) {
  const [pin, setPin] = useState(Array(6).fill(""));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const pinInputRefs = useRef([]);

  useEffect(() => {
    if (pinInputRefs.current[0]) {
      pinInputRefs.current[0].focus();
    }
  }, []);

  const handlePinChange = (index, value) => {
    setError(null);
    const char = value.slice(-1).toUpperCase();
    if (char && !/^[A-Z0-9]$/.test(char)) return;

    const newPin = [...pin];
    newPin[index] = char;
    setPin(newPin);

    if (char && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      setError(null);
      if (!pin[index] && index > 0) {
        pinInputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePinPaste = (e) => {
    e.preventDefault();
    setError(null);
    const pastedData = e.clipboardData.getData("text").trim().toUpperCase();
    const cleanData = pastedData.replace(/[^A-Z0-9]/g, "").slice(0, 6);

    if (cleanData) {
      const newPin = Array(6).fill("");
      for (let i = 0; i < cleanData.length; i++) {
        newPin[i] = cleanData[i];
      }
      setPin(newPin);

      const targetIndex = Math.min(cleanData.length, 5);
      pinInputRefs.current[targetIndex]?.focus();
    }
  };

  const handleAutoFillDemo = () => {
    setPin(["T", "R", "1", "D", "8", "9"]);
    setPassword("officer123");
    setError(null);
    if (pinInputRefs.current[5]) {
      pinInputRefs.current[5].focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    const fullPin = pin.join("");
    if (fullPin.length < 6) {
      setError("Please enter a complete 6-digit Officer Security PIN.");
      return;
    }

    if (!password.trim()) {
      setError("Please enter your Officer Security Password.");
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess();
    }, 600);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: "#041527",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        fontFamily: "'Nunito', sans-serif",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 30%, #003366 0%, #041527 80%)",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "440px",
          backgroundColor: "rgba(0, 34, 68, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "24px",
          padding: "32px",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div
            style={{
              display: "inline-block",
              alignSelf: "center",
              padding: "4px 12px",
              borderRadius: "999px",
              backgroundColor: "rgba(0, 90, 156, 0.3)",
              border: "1px solid rgba(0, 90, 156, 0.5)",
              color: "#60A5FA",
              fontSize: "11px",
              fontFamily: "monospace",
              fontWeight: "bold",
              letterSpacing: "0.1em",
            }}
          >
            OFFICER AUTHENTICATION GATEWAY
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "bold",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: 0,
            }}
          >
            TRIDENT PORTAL
          </h1>
          <p style={{ fontSize: "12px", color: "rgba(191, 219, 254, 0.7)", margin: 0 }}>
            Maritime SAR Intelligence & EEZ Surveillance Security Access
          </p>
        </div>

        <div
          style={{
            backgroundColor: "rgba(0, 51, 102, 0.4)",
            border: "1px solid rgba(96, 165, 250, 0.2)",
            borderRadius: "12px",
            padding: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
          }}
        >
          <div style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(191, 219, 254, 0.9)" }}>
            <div>Demo PIN: <strong style={{ color: "#fff" }}>TR1D89</strong></div>
            <div>Password: <strong style={{ color: "#fff" }}>officer123</strong></div>
          </div>
          <button
            type="button"
            onClick={handleAutoFillDemo}
            style={{
              padding: "6px 12px",
              backgroundColor: "#005A9C",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "10px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            AUTO FILL
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: "bold", color: "#93C5FD" }}>
              OFFICER PIN (6-DIGIT OTP)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px" }}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (pinInputRefs.current[i] = el)}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  onPaste={handlePinPaste}
                  style={{
                    height: "48px",
                    textAlign: "center",
                    fontSize: "20px",
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    textTransform: "uppercase",
                    borderRadius: "12px",
                    backgroundColor: digit ? "rgba(0, 51, 102, 0.6)" : "rgba(0, 0, 0, 0.4)",
                    border: digit ? "1px solid #60A5FA" : "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#ffffff",
                    outline: "none",
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: "bold", color: "#93C5FD" }}>
              OFFICER PASSWORD
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setError(null);
                  setPassword(e.target.value);
                }}
                placeholder="Enter password..."
                style={{
                  width: "100%",
                  height: "44px",
                  padding: "0 16px",
                  paddingRight: "40px",
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "12px",
                  color: "#ffffff",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  background: "none",
                  border: "none",
                  color: "#93C5FD",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#FCA5A5",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              backgroundColor: "#005A9C",
              border: "1px solid rgba(147, 197, 253, 0.3)",
              color: "#ffffff",
              fontWeight: "bold",
              fontSize: "13px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(0,0,0,0.3)",
            }}
          >
            {isLoading ? "VERIFYING CREDENTIALS..." : "AUTHENTICATE OFFICER"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
