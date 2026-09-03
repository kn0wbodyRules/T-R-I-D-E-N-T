"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface WordsPreloaderProps {
  onComplete: () => void;
  collegeName?: string;
}

const MOCK_GREETINGS = [
  "Hello Shamil",
  "नमस्ते शमिल",
  "வணக்கம் ஷமில்",
  "నమస్కారం షమిల్",
  "നമസ്കാരം ഷാമിൽ",
  "ನಮಸ್ಕಾರ ಶಮಿಲ್",
  "নমস্কার শামিল",
  "नमस्कार शमिल",
  "નમસ્તે શમિલ",
  "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਸ਼ਮਿਲ",
];

export default function WordsPreloader({
  onComplete,
  collegeName,
}: WordsPreloaderProps) {
  const wordsArray = [...MOCK_GREETINGS, `Welcome Shamil`];
  const [index, setIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  // Lock body scroll while preloader is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    // Cycle through words every 400ms until reaching the last string (slower)
    if (index < wordsArray.length - 1) {
      const interval = setInterval(() => {
        setIndex((prev) => prev + 1);
      }, 400);
      return () => clearInterval(interval);
    } else {
      // Pause on the final word for 800ms before starting exit animation
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-white text-[#005A9C] select-none overflow-hidden"
        >
          {/* Centered cycling word */}
          <div className="relative z-10 px-6 text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-[#005A9C] drop-shadow-sm font-sans"
              >
                {wordsArray[index]}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
