"use client";

import React, { useRef, useState, useEffect } from "react";
import { useScroll, useTransform, motion, MotionValue } from "motion/react";

export const ContainerScroll = ({
  titleComponent,
  children,
  onComplete,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
  onComplete?: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Detect when scroll animation reaches full resolution
  useEffect(() => {
    if (!onComplete) return;
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      if (latest >= 0.96) {
        onComplete();
      }
    });
    return () => unsubscribe();
  }, [scrollYProgress, onComplete]);

  // Dynamic 3D tilt-to-flat rotation
  const rotate = useTransform(scrollYProgress, [0, 0.85, 1], [26, 0, 0]);
  const scale = useTransform(
    scrollYProgress,
    [0, 0.85, 1],
    isMobile ? [0.8, 1, 1] : [0.95, 1, 1]
  );
  const translate = useTransform(scrollYProgress, [0, 0.85, 1], [0, -80, -120]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.5, 0.8], [1, 0.5, 0]);

  // Card morphing to full-bleed edge-to-edge
  const cardBorderRadius = useTransform(scrollYProgress, [0.7, 0.95], [38, 0]);
  const cardPadding = useTransform(scrollYProgress, [0.7, 0.95], [12, 0]);
  const containerBg = useTransform(scrollYProgress, [0.75, 0.95], ["#27187E", "#F4F7FB"]);

  return (
    <motion.div
      style={{
        backgroundColor: containerBg,
      }}
      className="h-[65rem] md:h-[82rem] flex flex-col items-center justify-start relative w-full overflow-hidden"
      ref={containerRef}
    >
      <div
        className="pt-16 md:pt-24 pb-0 w-full relative flex flex-col items-center"
        style={{
          perspective: "1200px",
        }}
      >
        <Header translate={translate} opacity={headerOpacity} titleComponent={titleComponent} />
        
        <Card
          rotate={rotate}
          scale={scale}
          borderRadius={cardBorderRadius}
          padding={cardPadding}
        >
          {children}
        </Card>
      </div>
    </motion.div>
  );
};

export const Header = ({
  translate,
  opacity,
  titleComponent,
}: {
  translate: MotionValue<number>;
  opacity: MotionValue<number>;
  titleComponent: string | React.ReactNode;
}) => {
  return (
    <motion.div
      style={{
        translateY: translate,
        opacity,
      }}
      className="max-w-5xl mx-auto text-center mb-6 px-4 z-10"
    >
      {titleComponent}
    </motion.div>
  );
};

export const Card = ({
  rotate,
  scale,
  borderRadius,
  padding,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  borderRadius: MotionValue<number>;
  padding: MotionValue<number>;
  children: React.ReactNode;
}) => {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        borderRadius,
        padding,
      }}
      className="w-full max-w-[1720px] mx-auto min-h-[90vh] bg-[#FFFFFF] shadow-[0_30px_90px_rgba(0,0,0,0.85)] border border-[rgba(0,90,156,0.2)] overflow-hidden"
    >
      <motion.div
        style={{
          borderRadius,
        }}
        className="h-full w-full bg-[#F4F7FB] overflow-y-auto"
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export default ContainerScroll;
