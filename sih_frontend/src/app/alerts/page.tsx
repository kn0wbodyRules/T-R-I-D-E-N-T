"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
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

      {/* Dispatch Channels */}
      <div className="theme-panel border rounded-[38px] p-6 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3 text-xs theme-text-muted">
          <span className="font-heading text-xl uppercase tracking-wide">DISPATCH CHANNELS:</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none theme-panel-subtle border px-4 py-2 rounded-full hover:border-[#005A9C] transition-colors">
            <input
              type="checkbox"
              checked={channelEmail}
              onChange={(e) => setChannelEmail(e.target.checked)}
              className="accent-[#005A9C]"
            />
            <span className="theme-text-primary">Email (ops-intel@ntro.gov.in)</span>
            <span className="text-[10px] text-[#00B074] font-bold">[ACTIVE]</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none theme-panel-subtle border px-4 py-2 rounded-full hover:border-[#005A9C] transition-colors">
            <input
              type="checkbox"
              checked={channelSms}
              onChange={(e) => setChannelSms(e.target.checked)}
              className="accent-[#005A9C]"
            />
            <span className="theme-text-primary">SMS / SATCOM Alert</span>
            <span className="text-[10px] text-[#00B074] font-bold">[ACTIVE]</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none theme-panel-subtle border px-4 py-2 rounded-full hover:border-[#005A9C] transition-colors">
            <input
              type="checkbox"
              checked={channelWebhook}
              onChange={(e) => setChannelWebhook(e.target.checked)}
              className="accent-[#005A9C]"
            />
            <span className="theme-text-primary">ICG Ops Room Webhook</span>
            <span className="text-[10px] theme-text-subtle">[STANDBY]</span>
          </label>
        </div>
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
