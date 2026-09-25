/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Home, by role. Administrators see the system; analytics holders (Team Leaders) see the
 * team; everyone else sees their own caseload. Students never reach this component.
 */
import { useSession } from "@/App";
import { AdminHome } from "./AdminHome";
import { TeamLeaderHome } from "./TeamLeaderHome";
import { CounsellorHome } from "./CounsellorHome";

export function Overview() {
  const { user, can } = useSession();
  if (user?.role === "super_admin" || user?.role === "admin") return <AdminHome />;
  if (can("analytics.view")) return <TeamLeaderHome />;
  return <CounsellorHome />;
}
