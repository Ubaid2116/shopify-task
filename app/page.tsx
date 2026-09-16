"use client";

import { useEffect, useState, useCallback } from "react";

declare global {
  interface Window {
    shopify?: {
      idToken: () => Promise<string>;
    };
  }
}

type ImageData = {
  id: string;
  productName: string;
  sourceUrl: string;
  width: number | null;
  height: number | null;
  format: string | null;
  originalBytes: number | null;
  estimatedOptimizedBytes: number | null;
  potentialSavingsBytes: number | null;
  reductionPercent: number | null;
  status: string;
};

type Stats = {
  totalImages: number;
  optimized: number;
  recommended: number;
  highPriority: number;
  failed: number;
  totalSavingsBytes: number;
  activeScanJob: { id: string; status: string; scanned: number; total: number } | null;
  activeOptimizationJobs: number;
};

function getIdTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("id_token");
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "N/A";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "OPTIMIZED":
      return { className: "polaris-badge-success", label: "Optimized" };
    case "RECOMMENDED":
      return { className: "polaris-badge-info", label: "Recommended" };
    case "HIGH_PRIORITY":
      return { className: "polaris-badge-warning", label: "High Priority" };
    case "FAILED":
      return { className: "polaris-badge-critical", label: "Failed" };
    default:
      return { className: "polaris-badge-neutral", label: status };
  }
}

export default function Home() {
  const [shop, setShop] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState("Connecting to your store...");
  const [stats, setStats] = useState<Stats | null>(null);
  const [images, setImages] = useState<ImageData[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchStats = useCallback(async (shopDomain: string) => {
    try {
      const res = await fetch("/api/stats", {
        headers: { "x-shop-domain": shopDomain },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }, []);

  const fetchImages = useCallback(async (shopDomain: string, page: number, status: string, search: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (status !== "ALL") params.set("status", status);
      if (search) params.set("search", search);
      const res = await fetch(`/api/images?${params}`, {
        headers: { "x-shop-domain": shopDomain },
      });
      if (res.ok) {
        const data = await res.json();
        setImages(data.images);
        setTotalImages(data.total);
      }
    } catch (e) {
      console.error("Failed to fetch images:", e);
    }
  }, []);

  useEffect(() => {
    async function authenticate() {
      try {
        let idToken: string | null = null;
        const urlToken = getIdTokenFromUrl();

        if (urlToken) {
          idToken = urlToken;
        } else {
          let attempts = 0;
          while (!window.shopify?.idToken && attempts < 50) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            attempts++;
          }
          if (!window.shopify?.idToken) {
            throw new Error("Shopify App Bridge is not available");
          }
          idToken = await Promise.race([
            window.shopify.idToken(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("ID token timeout")), 10000),
            ),
          ]);
        }

        if (!idToken) throw new Error("No ID token");

        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.details || data.error);

        setShop(data.shop);
        setAuthStatus(`Connected to ${data.shop}`);
        await fetchStats(data.shop);
        await fetchImages(data.shop, 1, "ALL", "");
      } catch (error) {
        setAuthStatus(error instanceof Error ? error.message : "Auth failed");
      }
    }
    authenticate();
  }, [fetchStats, fetchImages]);

  useEffect(() => {
    if (shop) {
      fetchImages(shop, currentPage, filter, searchQuery);
    }
  }, [shop, currentPage, filter, searchQuery, fetchImages]);

  useEffect(() => {
    if (!shop) return;
    const interval = setInterval(() => fetchStats(shop), 5000);
    return () => clearInterval(interval);
  }, [shop, fetchStats]);

  async function handleScan() {
    if (!shop || scanning) return;
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "x-shop-domain": shop },
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult({ type: "success", message: data.message || "Scan queued for processing" });
        await fetchStats(shop);
      } else {
        setScanResult({ type: "error", message: data.error || "Scan failed" });
      }
    } catch {
      setScanResult({ type: "error", message: "Scan failed. Please try again." });
    }
    setScanning(false);
  }

  async function handleOptimizeSelected() {
    if (!shop || selectedIds.size === 0 || optimizing) return;
    setOptimizing(true);
    try {
      const res = await fetch("/api/optimize/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shop-domain": shop,
        },
        body: JSON.stringify({ imageIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult({ type: "success", message: `${data.enqueued} images queued for optimization` });
        setSelectedIds(new Set());
        await fetchStats(shop);
      }
    } catch {
      setScanResult({ type: "error", message: "Optimization failed" });
    }
    setOptimizing(false);
  }

  async function handleOptimizeSingle(imageId: string) {
    if (!shop || optimizingId) return;
    setOptimizingId(imageId);
    setScanResult(null);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shop-domain": shop,
        },
        body: JSON.stringify({ imageId }),
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult({ type: "success", message: `Saved ${formatBytes(data.savingsBytes)} (${data.reductionPercent}% reduction)` });
        await fetchStats(shop);
        await fetchImages(shop, currentPage, filter, searchQuery);
      } else {
        setScanResult({ type: "error", message: data.error || "Optimization failed" });
      }
    } catch {
      setScanResult({ type: "error", message: "Optimization failed" });
    }
    setOptimizingId(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map((i) => i.id)));
    }
  }

  if (!shop) {
    return (
      <div className="dashboard">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 16 }}>
          <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
          <p style={{ color: "#6D7175", fontSize: 14 }}>{authStatus}</p>
        </div>
      </div>
    );
  }

  const needsOptimization = (stats?.recommended ?? 0) + (stats?.highPriority ?? 0);
  const scanProgress = stats?.activeScanJob
    ? Math.round((stats.activeScanJob.scanned / Math.max(stats.activeScanJob.total, 1)) * 100)
    : 0;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>StoreBoost Pro</h1>
          <p>Optimize your store&apos;s images for better performance</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`polaris-button ${scanning ? "polaris-button-outline" : "polaris-button-primary"}`}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning && <span className="spinner" />}
            {scanning ? "Scanning..." : "Scan Store"}
          </button>
          {selectedIds.size > 0 && (
            <button
              className={`polaris-button ${optimizing ? "polaris-button-outline" : "polaris-button-success"}`}
              onClick={handleOptimizeSelected}
              disabled={optimizing}
            >
              {optimizing && <span className="spinner" />}
              {optimizing ? "Optimizing..." : `Optimize Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
      </header>

      {scanResult && (
        <div className={`alert ${scanResult.type === "error" ? "alert-error" : "alert-success"}`}>
          {scanResult.type === "error" ? "✕" : "✓"} {scanResult.message}
        </div>
      )}

      {stats?.activeScanJob && (
        <div className="alert alert-info">
          <span className="spinner spinner-dark" />
          Scanning: {stats.activeScanJob.scanned} / {stats.activeScanJob.total} images ({scanProgress}%)
        </div>
      )}

      {stats && stats.activeOptimizationJobs > 0 && (
        <div className="alert alert-info">
          <span className="spinner spinner-dark" />
          {stats.activeOptimizationJobs} image(s) being optimized in background...
        </div>
      )}

      <section className="stats-grid">
        {[
          { label: "Total Images", value: stats?.totalImages ?? 0, color: "#006fbb" },
          { label: "Optimized", value: stats?.optimized ?? 0, color: "#008060" },
          { label: "Needs Optimization", value: needsOptimization, color: "#b98900" },
          { label: "Potential Savings", value: formatBytes(stats?.totalSavingsBytes ?? 0), color: "#d72c0d" },
        ].map((card) => (
          <div key={card.label} className="polaris-card stat-card">
            <span className="stat-label">{card.label}</span>
            <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </section>

      <div className="polaris-card">
        <div className="section-header">
          <h2>Product Images</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="text"
              className="polaris-textfield"
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{ width: 200 }}
            />
            <div className="filter-group">
              {[
                { key: "ALL", label: "All" },
                { key: "OPTIMIZED", label: "Optimized" },
                { key: "RECOMMENDED", label: "Recommended" },
                { key: "HIGH_PRIORITY", label: "High Priority" },
              ].map((f) => (
                <button
                  key={f.key}
                  className={`filter-button ${filter === f.key ? "filter-button-active" : ""}`}
                  onClick={() => { setFilter(f.key); setCurrentPage(1); }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {images.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📷</div>
            <h3>No images found</h3>
            <p>Click &quot;Scan Store&quot; to analyze your product images</p>
            <button
              className={`polaris-button ${scanning ? "polaris-button-outline" : "polaris-button-primary"}`}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning && <span className="spinner" />}
              {scanning ? "Scanning..." : "Scan Store"}
            </button>
          </div>
        ) : (
          <table className="polaris-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === images.length && images.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Image</th>
                <th>Product</th>
                <th>Size</th>
                <th>Format</th>
                <th>Est. Savings</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {images.map((img) => {
                const badge = getStatusBadge(img.status);
                return (
                  <tr key={img.id}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(img.id)}
                        onChange={() => toggleSelect(img.id)}
                      />
                    </td>
                    <td>
                      <img
                        src={img.sourceUrl}
                        alt={img.productName}
                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid #e1e3e5" }}
                      />
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {img.productName}
                    </td>
                    <td style={{ color: "#374151" }}>{formatBytes(img.originalBytes)}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#6d7175", backgroundColor: "#f4f6f8", padding: "2px 6px", borderRadius: 4 }}>
                        {img.format?.replace("image/", "").toUpperCase() ?? "N/A"}
                      </span>
                    </td>
                    <td style={{ color: img.potentialSavingsBytes ? "#d72c0d" : "#6d7175", fontWeight: img.potentialSavingsBytes ? 600 : 400 }}>
                      {img.potentialSavingsBytes
                        ? `${formatBytes(img.potentialSavingsBytes)} (${img.reductionPercent}%)`
                        : "—"}
                    </td>
                    <td>
                      <span className={`polaris-badge ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {img.status !== "OPTIMIZED" && (
                        <button
                          className={`polaris-button ${optimizingId === img.id ? "polaris-button-outline" : "polaris-button-success"}`}
                          onClick={() => handleOptimizeSingle(img.id)}
                          disabled={optimizingId === img.id}
                          style={{ padding: "4px 12px", fontSize: 12 }}
                        >
                          {optimizingId === img.id && <span className="spinner" />}
                          {optimizingId === img.id ? "Working..." : "Optimize"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalImages > 10 && (
          <div className="pagination">
            <span className="pagination-info">
              Showing {(currentPage - 1) * 10 + 1}–{Math.min(currentPage * 10, totalImages)} of {totalImages}
            </span>
            <div className="pagination-buttons">
              <button
                className="polaris-button polaris-button-outline"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: "4px 12px", fontSize: 13 }}
              >
                ← Previous
              </button>
              <button
                className="polaris-button polaris-button-outline"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage * 10 >= totalImages}
                style={{ padding: "4px 12px", fontSize: 13 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
