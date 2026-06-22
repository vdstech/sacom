"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/ProtectedPage";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { hasAnyPermission } from "@/lib/permissions";
import { ADMIN_UI_STRINGS } from "@/lib/uiStrings";
import { PaginationControls } from "@/components/PaginationControls";

const PAGE_SIZE = 25;

type AdminReview = {
  id: string;
  productId: string;
  variantId?: string;
  customerDisplayName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedBuyer: boolean;
  verificationOrderId?: string;
  verificationOrderItemId?: string;
  status: string;
  moderationReason?: string;
  moderationNote?: string;
  moderationSource?: string;
  moderationSignals?: string[];
  automatedModeration?: {
    provider?: string;
    model?: string;
    decision?: string;
    reason?: string;
    categories?: string[];
    scores?: Record<string, number>;
    checkedAt?: string | null;
    requestId?: string;
    failureReason?: string;
  };
  createdAt?: string | null;
  product?: {
    id: string;
    title: string;
    slug: string;
  } | null;
  variant?: {
    id: string;
    sizeLabel?: string;
    colorNames?: string[];
  } | null;
  verificationOrder?: {
    id: string;
    displayId?: string;
  } | null;
};

type ReviewListResponse = {
  items: AdminReview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function ProductReviewsPage() {
  const { accessToken, refreshAccessToken, me } = useAuth();
  const systemLevel = String(me?.systemLevel || me?.user?.systemLevel || "NONE").toUpperCase();
  const isSystemBypass = systemLevel === "SUPER" || systemLevel === "ADMIN";
  const permissions = me?.permissions || [];
  const canRead = isSystemBypass || hasAnyPermission(permissions, ["review:read", "review:moderate"]);
  const canModerate = isSystemBypass || hasAnyPermission(permissions, ["review:moderate"]);

  const [items, setItems] = useState<AdminReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("");
  const [verifiedBuyer, setVerifiedBuyer] = useState("");
  const [rating, setRating] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const [moderationNote, setModerationNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");

  const selectedReview = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => current === searchInput.trim() ? current : searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (status) params.set("status", status);
        if (verifiedBuyer) params.set("verifiedBuyer", verifiedBuyer);
        if (rating) params.set("rating", rating);
        if (search) params.set("search", search);

        const payload = await apiRequest<ReviewListResponse>(`/api/admin/products/reviews?${params.toString()}`, {
          service: "product",
          token: accessToken,
          onUnauthorized: refreshAccessToken,
        });
        if (cancelled) return;
        setItems(payload.items || []);
        setTotal(Number(payload.total || 0));
        setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
        setSelectedId((current) => current && payload.items?.some((item) => item.id === current) ? current : payload.items?.[0]?.id || "");
        setError("");
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canRead, accessToken, refreshAccessToken, page, status, verifiedBuyer, rating, search]);

  useEffect(() => {
    setModerationReason(selectedReview?.moderationReason || "");
    setModerationNote(selectedReview?.moderationNote || "");
  }, [selectedReview?.id]);

  const performAction = async (action: "approve" | "reject" | "hide") => {
    if (!selectedReview || !canModerate) return;
    setBusyAction(action);
    try {
      await apiRequest<{ review: AdminReview }>(`/api/admin/products/reviews/${encodeURIComponent(selectedReview.id)}/${action}`, {
        service: "product",
        method: "POST",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
        body: {
          moderationReason,
          moderationNote,
        },
      });
      const refreshed = await apiRequest<ReviewListResponse>(`/api/admin/products/reviews?page=${page}&limit=${PAGE_SIZE}${status ? `&status=${encodeURIComponent(status)}` : ""}${verifiedBuyer ? `&verifiedBuyer=${encodeURIComponent(verifiedBuyer)}` : ""}${rating ? `&rating=${encodeURIComponent(rating)}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`, {
        service: "product",
        token: accessToken,
        onUnauthorized: refreshAccessToken,
      });
      setItems(refreshed.items || []);
      setSelectedId(selectedReview.id);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <ProtectedPage anyOf={["review:read", "review:moderate"]}>
      {!canRead ? (
        <div className="card">Forbidden</div>
      ) : (
        <>
          <section className="card row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="orders-detail__eyebrow">{ADMIN_UI_STRINGS.menu.products}</div>
              <h1 style={{ margin: "6px 0 0" }}>{ADMIN_UI_STRINGS.reviews.title}</h1>
              <p className="section-copy" style={{ marginTop: 8 }}>{ADMIN_UI_STRINGS.reviews.subtitle}</p>
            </div>
            <button className="secondary" onClick={() => setPage(1)}>{ADMIN_UI_STRINGS.common.refresh}</button>
          </section>

          <section className="card" style={{ display: "grid", gap: 12 }}>
            <div className="section-kicker">{ADMIN_UI_STRINGS.reviews.filtersTitle}</div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={ADMIN_UI_STRINGS.reviews.searchPlaceholder}
                style={{ minWidth: 280, flex: "1 1 280px" }}
              />
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">{ADMIN_UI_STRINGS.reviews.statusAll}</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="HIDDEN">HIDDEN</option>
              </select>
              <select value={verifiedBuyer} onChange={(event) => { setVerifiedBuyer(event.target.value); setPage(1); }}>
                <option value="">{ADMIN_UI_STRINGS.reviews.verifiedAll}</option>
                <option value="true">{ADMIN_UI_STRINGS.reviews.verifiedOnly}</option>
                <option value="false">{ADMIN_UI_STRINGS.reviews.unverifiedOnly}</option>
              </select>
              <select value={rating} onChange={(event) => { setRating(event.target.value); setPage(1); }}>
                <option value="">{ADMIN_UI_STRINGS.reviews.ratingAll}</option>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>{value} / 5</option>
                ))}
              </select>
            </div>
          </section>

          {error ? <div className="error">{error}</div> : null}

          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)", gap: 16 }}>
            <div className="card" style={{ display: "grid", gap: 12 }}>
              {loading ? <div>{ADMIN_UI_STRINGS.reviews.loading}</div> : null}
              {!loading && !items.length ? <div>{ADMIN_UI_STRINGS.reviews.empty}</div> : null}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="secondary"
                  style={{
                    textAlign: "left",
                    padding: 16,
                    border: selectedReview?.id === item.id ? "1px solid #111827" : undefined,
                    display: "grid",
                    gap: 8,
                  }}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{item.product?.title || ADMIN_UI_STRINGS.reviews.productUnavailable}</strong>
                    <span>{item.rating} / 5</span>
                  </div>
                  <div>{item.title}</div>
                  <div className="section-copy">{item.customerDisplayName}</div>
                  <div className="section-copy">{item.status}{item.verifiedBuyer ? ` • ${ADMIN_UI_STRINGS.reviews.verifiedBuyer}` : ""}</div>
                </button>
              ))}
              <PaginationControls
                page={page}
                total={total}
                totalPages={totalPages}
                onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
                previousLabel={ADMIN_UI_STRINGS.common.previous}
                nextLabel={ADMIN_UI_STRINGS.common.next}
              />
            </div>

            <div className="card" style={{ display: "grid", gap: 12, alignContent: "start" }}>
              {selectedReview ? (
                <>
                  <div>
                    <div className="section-kicker">{ADMIN_UI_STRINGS.reviews.detailTitle}</div>
                    <h2 style={{ margin: "6px 0 0" }}>{selectedReview.product?.title || ADMIN_UI_STRINGS.reviews.productUnavailable}</h2>
                  </div>
                  <div><strong>{ADMIN_UI_STRINGS.reviews.customer}:</strong> {selectedReview.customerDisplayName}</div>
                  <div><strong>{ADMIN_UI_STRINGS.reviews.rating}:</strong> {selectedReview.rating} / 5</div>
                  <div><strong>{ADMIN_UI_STRINGS.reviews.status}:</strong> {selectedReview.status}</div>
                  <div><strong>{ADMIN_UI_STRINGS.reviews.created}:</strong> {formatDate(selectedReview.createdAt)}</div>
                  <div><strong>{ADMIN_UI_STRINGS.reviews.verifiedBuyer}:</strong> {selectedReview.verifiedBuyer ? "Yes" : "No"}</div>
                  {selectedReview.moderationSource ? (
                    <div><strong>{ADMIN_UI_STRINGS.reviews.moderationSource}:</strong> {selectedReview.moderationSource}</div>
                  ) : null}
                  {selectedReview.moderationSignals?.length ? (
                    <div><strong>{ADMIN_UI_STRINGS.reviews.moderationSignals}:</strong> {selectedReview.moderationSignals.join(", ")}</div>
                  ) : null}
                  {selectedReview.automatedModeration?.provider ? (
                    <div>
                      <div className="section-kicker">{ADMIN_UI_STRINGS.reviews.automatedModeration}</div>
                      <div><strong>{ADMIN_UI_STRINGS.reviews.moderationProvider}:</strong> {selectedReview.automatedModeration.provider}</div>
                      <div><strong>{ADMIN_UI_STRINGS.reviews.moderationModel}:</strong> {selectedReview.automatedModeration.model || "-"}</div>
                      <div><strong>{ADMIN_UI_STRINGS.reviews.moderationDecision}:</strong> {selectedReview.automatedModeration.decision || "-"}</div>
                      <div><strong>{ADMIN_UI_STRINGS.reviews.moderationReason}:</strong> {selectedReview.automatedModeration.reason || "-"}</div>
                      {selectedReview.automatedModeration.categories?.length ? (
                        <div><strong>{ADMIN_UI_STRINGS.reviews.moderationCategories}:</strong> {selectedReview.automatedModeration.categories.join(", ")}</div>
                      ) : null}
                      {Object.keys(selectedReview.automatedModeration.scores || {}).length ? (
                        <div><strong>{ADMIN_UI_STRINGS.reviews.moderationScores}:</strong> {Object.entries(selectedReview.automatedModeration.scores || {}).map(([category, score]) => `${category}: ${Number(score).toFixed(3)}`).join(" • ")}</div>
                      ) : null}
                      {selectedReview.automatedModeration.failureReason ? (
                        <div><strong>{ADMIN_UI_STRINGS.reviews.moderationFailure}:</strong> {selectedReview.automatedModeration.failureReason}</div>
                      ) : null}
                      <div><strong>{ADMIN_UI_STRINGS.reviews.moderationCheckedAt}:</strong> {formatDate(selectedReview.automatedModeration.checkedAt)}</div>
                    </div>
                  ) : null}
                  {selectedReview.verificationOrder?.displayId ? (
                    <div><strong>{ADMIN_UI_STRINGS.reviews.orderReference}:</strong> {selectedReview.verificationOrder.displayId}</div>
                  ) : null}
                  <div>
                    <div className="section-kicker">{ADMIN_UI_STRINGS.reviews.reviewContent}</div>
                    <div style={{ fontWeight: 700 }}>{selectedReview.title}</div>
                    <div>{selectedReview.comment}</div>
                  </div>
                  {selectedReview.variant ? (
                    <div>
                      <div className="section-kicker">{ADMIN_UI_STRINGS.reviews.verificationContext}</div>
                      <div className="section-copy">
                        {[selectedReview.variant.sizeLabel, ...(selectedReview.variant.colorNames || [])].filter(Boolean).join(" • ") || "-"}
                      </div>
                    </div>
                  ) : null}
                  {canModerate ? (
                    <>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span>{ADMIN_UI_STRINGS.reviews.moderationReason}</span>
                        <input value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} maxLength={240} />
                      </label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span>{ADMIN_UI_STRINGS.reviews.moderationNote}</span>
                        <textarea value={moderationNote} onChange={(event) => setModerationNote(event.target.value)} rows={4} maxLength={1000} />
                      </label>
                      <div className="row">
                        <button type="button" onClick={() => void performAction("approve")} disabled={busyAction !== ""}>{ADMIN_UI_STRINGS.reviews.approve}</button>
                        <button type="button" className="secondary" onClick={() => void performAction("reject")} disabled={busyAction !== ""}>{ADMIN_UI_STRINGS.reviews.reject}</button>
                        <button type="button" className="secondary" onClick={() => void performAction("hide")} disabled={busyAction !== ""}>{ADMIN_UI_STRINGS.reviews.hide}</button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <div>{ADMIN_UI_STRINGS.reviews.selectPrompt}</div>
              )}
            </div>
          </section>
        </>
      )}
    </ProtectedPage>
  );
}
