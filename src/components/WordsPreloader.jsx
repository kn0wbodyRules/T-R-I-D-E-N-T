import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DEFAULT_WORDS = [
  "Hello",
  "नमस्ते",
  "வணக்கம்",
  "నమస్కారం",
  "നമസ്കാരം",
  "<ctrl42><ctrl42>നമസ്കാര",
  "নমস্কার",
  "नमस्कार",
  "નમસ્તે",
  "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ",
];

export default function WordsPreloader({
  onComplete,
  collegeName = "TRIDENT PORTAL",
}) {
  const wordsArray = [...DEFAULT_WORDS, `Welcome to ${collegeName}`];
  const [index, setIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (index < wordsArray.length - 1) {
      const interval = setInterval(() => {
        setIndex((prev) => prev + 1);
      }, 200);
      return () => clearInterval(interval);
    } else {
      const timer = setTimeout(() => {
        setIsDone(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [index, wordsArray.length]);

  return (
    <AnimatePresence mode="wait" onExitComplete={onComplete}>
      {!isDone && (
        <motion.div
          key="preloader-overlay"
          initial={{ y: "0%" }}
          animate={{ y: "0%" }}
          exit={{ y: "-100%" }}
          transition={{
            duration: 0.8,
            ease: [0.76, 0, 0.24, 1],
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#003366",
            color: "#ffffff",
            overflow: "hidden",
            userSelect: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              zIndex: 10,
              textAlign: "center",
              padding: "0 24px",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                style={{
                  fontSize: "3.5rem",
                  fontWeight: "bold",
                  color: "#ffffff",
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                {wordsArray[index]}
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: "32px",
              fontSize: "12px",
              letterSpacing: "0.1em",
              color: "rgba(191, 219, 254, 0.6)",
              fontFamily: "monospace",
              textTransform: "uppercase",
            }}
          >
            SECURE MARITIME PORTAL · AUTHENTICATED SESSION
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
