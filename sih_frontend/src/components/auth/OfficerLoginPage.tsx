"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import MaterialIcon from "@/components/ui/MaterialIcon";

interface OfficerLoginPageProps {
  onLoginSuccess: () => void;
}

export default function OfficerLoginPage({ onLoginSuccess }: OfficerLoginPageProps) {
  // 6-digit OTP PIN state
  const [pin, setPin] = useState<string[]>(Array(6).fill(""));
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Refs for the 6 PIN input elements
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first PIN box on mount
  useEffect(() => {
    if (pinInputRefs.current[0]) {
      pinInputRefs.current[0].focus();
    }
  }, []);

  // Handle PIN input change (Auto-advance to next box)
  const handlePinChange = (index: number, value: string) => {
    setError(null);
    // Take only the last entered character and convert to uppercase
    const char = value.slice(-1).toUpperCase();

    // Only allow alphanumeric characters
    if (char && !/^[A-Z0-9]$/.test(char)) return;

    const newPin = [...pin];
    newPin[index] = char;
    setPin(newPin);

    // Auto focus next input if character was typed
    if (char && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle Backspace navigation
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      setError(null);
      if (!pin[index] && index > 0) {
        pinInputRefs.current[index - 1]?.focus();
      }
    }
  };

  // Handle Paste event on PIN boxes
  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
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

      // Focus box after last pasted char or box 5
      const targetIndex = Math.min(cleanData.length, 5);
      pinInputRefs.current[targetIndex]?.focus();
    }
  };

  // Auto-fill demo credentials
  const handleAutoFillDemo = () => {
    setPin(["T", "R", "1", "D", "8", "9"]);
    setPassword("officer123");
    setError(null);
    if (pinInputRefs.current[5]) {
      pinInputRefs.current[5].focus();
    }
  };

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
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

    // Simulate verification delay
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess();
    }, 600);
  };

  return (
    <div className="relative min-h-screen w-full flex overflow-hidden select-none">
      
      {/* Decorative background elements (now handled globally in layout.tsx) */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-50 z-0">
      </div>

      {/* Left Side: Big Typography */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-12 xl:px-24 relative z-10">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="font-heading text-5xl lg:text-6xl xl:text-7xl tracking-tight uppercase leading-[0.9]"
        >
          <span className="font-climate font-heading" style={{ WebkitTextStroke: "2px #005A9C", color: "white" }}>
            OCEAN LEAKS ARE HARMFUL AND{" "}
          </span>
          <span className="font-climate font-heading text-[#005A9C]">
            PUNISHABLE
          </span>
        </motion.h1>
      </div>

      {/* Right Side: Etched Login Panel */}
      <div className="w-full lg:w-[500px] xl:w-[560px] bg-white border-l border-[#005A9C]/20 shadow-[-20px_0_60px_rgba(0,90,156,0.05)] flex items-center justify-center relative z-20">
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="w-full p-8 sm:p-12 text-[#005A9C] flex flex-col gap-6"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-2">
            <h1 className="text-4xl font-climate font-heading font-extrabold tracking-wide uppercase mt-2">
              LOGIN
            </h1>
          </div>

          {/* Demo Fill Helper */}
          <div className="bg-[#F4F7FB] border border-[#005A9C]/20 rounded-xl p-3 flex items-center justify-between text-xs mt-2">
            <div className="flex flex-col text-[11px] text-[#005A9C]/80 font-mono">
              <span>Demo PIN: <strong className="text-[#005A9C]">TR1D89</strong></span>
              <span>Password: <strong className="text-[#005A9C]">officer123</strong></span>
            </div>
            <button
              type="button"
              onClick={handleAutoFillDemo}
              className="px-2.5 py-1 bg-[#005A9C]/10 hover:bg-[#005A9C]/20 text-[#005A9C] text-[10px] font-bold rounded-lg transition-all shadow-sm active:scale-95"
            >
              AUTO FILL
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Officer PIN Section (6-digit OTP format) */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#005A9C]/90 font-bold flex items-center justify-between">
                <span>OFFICER PIN (6-DIGIT OTP)</span>
              </label>

              {/* 6 OTP Boxes */}
              <div className="grid grid-cols-6 gap-2">
                {pin.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { pinInputRefs.current[index] = el; }}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    onPaste={handlePinPaste}
                    className={`w-full h-12 text-center text-xl font-mono font-extrabold uppercase rounded-xl bg-[#F4F7FB] border transition-all outline-none ${
                      digit
                        ? "border-[#005A9C] text-[#005A9C] shadow-[0_0_12px_rgba(0,90,156,0.15)]"
                        : "border-[#005A9C]/20 text-[#005A9C]/80 focus:border-[#005A9C]"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Officer Password Section */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-[#005A9C]/90 font-bold">
                OFFICER PASSWORD
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setError(null);
                    setPassword(e.target.value);
                  }}
                  placeholder="Enter password..."
                  className="w-full h-11 px-4 pr-10 bg-[#F4F7FB] border border-[#005A9C]/20 focus:border-[#005A9C] rounded-xl text-sm font-sans text-[#005A9C] placeholder:text-[#005A9C]/40 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-[#005A9C]/60 hover:text-[#005A9C] transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} size={18} />
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-xs font-semibold flex items-center gap-2"
              >
                <MaterialIcon name="error" size={16} className="text-red-500 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 mt-2 rounded-xl bg-[#005A9C] hover:bg-[#00477d] border border-[#005A9C]/50 text-white font-bold text-sm tracking-wider uppercase shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>VERIFYING CREDENTIALS...</span>
                </>
              ) : (
                <>
                  <MaterialIcon name="lock" size={18} />
                  <span>AUTHENTICATE OFFICER</span>
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
