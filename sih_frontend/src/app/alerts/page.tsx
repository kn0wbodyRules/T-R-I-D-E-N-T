"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { motion, AnimatePresence } from "motion/react";
import { fetchAlerts } from "@/lib/mock-data";
import { useIncident } from "@/components/providers/IncidentContext";
import SignalFlagBadge from "@/components/ui/SignalFlagBadge";
import MaterialIcon from "@/components/ui/MaterialIcon";

export default function AlertsPage() {
  const { setActiveIncidentId, setAlertsCount } = useIncident();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
  });

  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [channelEmail, setChannelEmail] = useState(true);
  const [channelSms, setChannelSms] = useState(true);
  const [channelWebhook, setChannelWebhook] = useState(false);
  const [markedRead, setMarkedRead] = useState<Record<string, boolean>>({});

  const handleMarkAllRead = () => {
    const updated: Record<string, boolean> = {};
    alerts.forEach((a) => (updated[a.id] = true));
    setMarkedRead(updated);
    setAlertsCount(0);
  };

  return (
    <div className="flex-1 flex flex-col p-6 sm:p-8 max-w-[1400px] w-full mx-auto theme-canvas transition-colors duration-250">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b theme-border pb-4 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs theme-text-subtle mb-1">
            <span>TACTICAL NOTIFICATIONS</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">MARITIME SECURITY STREAM</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide uppercase">
            Operational Alerts & Transmission Log
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkAllRead}
            className="px-5 py-2.5 theme-panel border hover:border-[#005A9C] text-xs text-[#005A9C] font-bold rounded-full flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            <span>MARK ALL AS READ</span>
          </button>
        </div>
      </div>

      {/* Dispatch Channels Dropdown Pill */}
      <div className="relative mb-8 self-start">
        <button
          onClick={() => setIsDispatchOpen(!isDispatchOpen)}
          className="theme-panel border hover:border-[#005A9C] rounded-full px-5 py-2.5 flex items-center gap-4 shadow-xs transition-colors cursor-pointer"
        >
          <span className="font-heading text-lg sm:text-xl uppercase tracking-wide">DISPATCH CHANNELS</span>
          <div className="flex items-center gap-2.5 ml-1 sm:ml-2 border-l pl-3 sm:pl-4 theme-border">
            <div className="flex items-center gap-1.5" title="Active Channels">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00B074] shadow-[0_0_8px_rgba(0,176,116,0.6)]"></span>
              <span className="font-number font-bold text-[#00B074] text-sm">
                {[channelEmail, channelSms, channelWebhook].filter(Boolean).length}
              </span>
            </div>
            <div className="flex items-center gap-1.5" title="Standby Channels">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFB800] opacity-80"></span>
              <span className="font-number font-bold text-[#FFB800] text-sm opacity-80">
                {3 - [channelEmail, channelSms, channelWebhook].filter(Boolean).length}
              </span>
            </div>
          </div>
          <MaterialIcon
            name={isDispatchOpen ? "expand_less" : "expand_more"}
            size={20}
            className="ml-1 theme-text-subtle"
          />
        </button>

        <AnimatePresence>
          {isDispatchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="absolute top-full left-0 mt-3 p-2 theme-panel border rounded-2xl shadow-xl z-50 flex flex-col gap-1 min-w-[280px]"
            >
              <label className="flex items-center justify-between cursor-pointer group p-3 hover:bg-[rgba(0,90,156,0.05)] rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={channelEmail}
                    onChange={(e) => setChannelEmail(e.target.checked)}
                    className="accent-[#005A9C] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-semibold theme-text-primary group-hover:text-[#005A9C] transition-colors">
                    Email (ops-intel@ntro.gov.in)
                  </span>
                </div>
                {channelEmail ? (
                  <span className="w-2 h-2 rounded-full bg-[#00B074] shadow-[0_0_5px_rgba(0,176,116,0.5)]"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#FFB800] opacity-50"></span>
                )}
              </label>

              <label className="flex items-center justify-between cursor-pointer group p-3 hover:bg-[rgba(0,90,156,0.05)] rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={channelSms}
                    onChange={(e) => setChannelSms(e.target.checked)}
                    className="accent-[#005A9C] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-semibold theme-text-primary group-hover:text-[#005A9C] transition-colors">
                    SMS / SATCOM Alert
                  </span>
                </div>
                {channelSms ? (
                  <span className="w-2 h-2 rounded-full bg-[#00B074] shadow-[0_0_5px_rgba(0,176,116,0.5)]"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#FFB800] opacity-50"></span>
                )}
              </label>

              <label className="flex items-center justify-between cursor-pointer group p-3 hover:bg-[rgba(0,90,156,0.05)] rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={channelWebhook}
                    onChange={(e) => setChannelWebhook(e.target.checked)}
                    className="accent-[#005A9C] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-semibold theme-text-primary group-hover:text-[#005A9C] transition-colors">
                    ICG Ops Room Webhook
                  </span>
                </div>
                {channelWebhook ? (
                  <span className="w-2 h-2 rounded-full bg-[#00B074] shadow-[0_0_5px_rgba(0,176,116,0.5)]"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#FFB800] opacity-50"></span>
                )}
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Alert Feed */}
      <div className="theme-panel border rounded-[38px] flex flex-col overflow-hidden shadow-xs">
        <div className="px-8 py-5 theme-panel-subtle border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-heading text-xl uppercase tracking-wide">
              CHRONOLOGICAL INCIDENT ALERT FEED
            </span>
            <span className="text-[10px] theme-text-subtle font-bold tracking-wider">
              LEGEND: <span className="text-[#EF3E42]">C = CRITICAL</span> <span className="opacity-40 px-1">|</span> <span className="text-[#FFB800]">P = PENDING</span> <span className="opacity-40 px-1">|</span> <span className="text-[#005A9C]">I = INFORMATION</span>
            </span>
          </div>
          <div className="flex items-center justify-center text-white bg-[#005A9C] w-8 h-8 rounded-full shadow-sm" title={`Total Events: ${alerts.length}`}>
            <MaterialIcon
              name={`counter_${Math.min(9, Math.max(0, alerts.length))}`}
              size={20}
              className="leading-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs theme-text-subtle">
            POLLING MARITIME EVENT STREAM...
          </div>
        ) : (
          <div className="divide-y theme-border">
            {alerts.map((alert) => {
              const isRead = markedRead[alert.id] || !alert.unread;

              return (
                <div
                  key={alert.id}
                  className={clsx(
                    "p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors",
                    !isRead
                      ? "theme-panel-elevated"
                      : "hover:opacity-90"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[#005A9C] font-bold">
                          {alert.timestamp}
                        </span>
                        <SignalFlagBadge severity={alert.severity} />
                        {!isRead && (
                          <span className="text-[9px] text-[#EF3E42] font-bold">
                            ● NEW
                          </span>
                        )}
                      </div>

                      <p className="text-xs theme-text-muted leading-relaxed">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={`/incident/${alert.incident_id}/intake`}
                    onClick={() => setActiveIncidentId(alert.incident_id)}
                    className="px-5 py-2.5 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold rounded-full border border-[#005A9C] transition-colors flex items-center gap-2 shrink-0 self-start sm:self-auto"
                  >
                    <span>OPEN {alert.incident_id} →</span>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
