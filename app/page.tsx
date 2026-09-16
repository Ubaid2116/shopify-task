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
  activeScanJob: { id: string; status: string; scanned: number; total: number; error?: string } | null;
  activeOptimizationJobs: number;
};

/* ── Inline SVG Icons ── */
function Icon({ name, size = 16, color = "currentColor", className = "" }: { name: string; size?: number; color?: string; className?: string }) {
  const s = size;
  const icons: Record<string, React.ReactNode> = {
    bolt: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={color} stroke="none" />
      </svg>
    ),
    search: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    sparkles: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" fill={color} stroke="none" />
        <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill={color} stroke="none" opacity="0.6" />
      </svg>
    ),
    image: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    check: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    arrowDown: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>
    ),
    camera: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    arrowLeft: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    ),
    arrowRight: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    ),
    xMark: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    checkCircle: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    star: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill={color} stroke="none">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    warning: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    xCircle: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    dot: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill={color}>
        <circle cx="12" cy="12" r="5" />
      </svg>
    ),
  };

  return <span className={`icon ${className}`} style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>{icons[name] || null}</span>;
}

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
      return { className: "polaris-badge-success", label: "Optimized", icon: "check", iconColor: "#065f46" };
    case "RECOMMENDED":
      return { className: "polaris-badge-info", label: "Recommended", icon: "star", iconColor: "#1e40af" };
    case "HIGH_PRIORITY":
      return { className: "polaris-badge-warning", label: "High Priority", icon: "warning", iconColor: "#92400e" };
    case "FAILED":
      return { className: "polaris-badge-critical", label: "Failed", icon: "xCircle", iconColor: "#991b1b" };
    default:
      return { className: "polaris-badge-neutral", label: status, icon: "dot", iconColor: "#5c677d" };
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
        setScanResult({ type: "success", message: data.message || "Scan completed" });
        await fetchStats(shop);
        await fetchImages(shop, 1, filter, searchQuery);
        setCurrentPage(1);
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
        <div className="loading-screen">
          <div className="loading-logo">
            <Icon name="bolt" size={28} color="white" />
          </div>
          <p className="loading-text">{authStatus}</p>
        </div>
      </div>
    );
  }

  const needsOptimization = (stats?.recommended ?? 0) + (stats?.highPriority ?? 0);
  const scanProgress = stats?.activeScanJob
    ? Math.round((stats.activeScanJob.scanned / Math.max(stats.activeScanJob.total, 1)) * 100)
    : 0;
  const hasActiveScan = stats?.activeScanJob && (stats.activeScanJob.status === "QUEUED" || stats.activeScanJob.status === "PROCESSING");

  const statCards = [
    { label: "Total Images", value: stats?.totalImages ?? 0, color: "#0466c8", icon: "image", iconClass: "stat-icon-blue" },
    { label: "Optimized", value: stats?.optimized ?? 0, color: "#059669", icon: "check", iconClass: "stat-icon-green" },
    { label: "Needs Work", value: needsOptimization, color: "#d97706", icon: "bolt", iconClass: "stat-icon-yellow" },
    { label: "Potential Savings", value: formatBytes(stats?.totalSavingsBytes ?? 0), color: "#dc2626", icon: "arrowDown", iconClass: "stat-icon-red" },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>
            <Icon name="bolt" size={22} color="white" /> StoreBoost Pro
          </h1>
          <p>Optimize your store&apos;s images for better performance</p>
        </div>
        <div className="header-actions">
          <button
            className={`polaris-button ${(scanning || hasActiveScan) ? "polaris-button-outline" : "polaris-button-primary"}`}
            onClick={handleScan}
            disabled={scanning || !!hasActiveScan}
            style={(scanning || hasActiveScan) ? { color: "white", borderColor: "rgba(255,255,255,0.3)" } : {}}
          >
            {(scanning || hasActiveScan) && <span className="spinner" />}
            {(scanning || hasActiveScan) ? "Scanning..." : <><Icon name="search" size={15} /> Scan Store</>}
          </button>
          {selectedIds.size > 0 && (
            <button
              className={`polaris-button ${optimizing ? "polaris-button-outline" : "polaris-button-success"}`}
              onClick={handleOptimizeSelected}
              disabled={optimizing}
              style={optimizing ? { color: "white", borderColor: "rgba(255,255,255,0.3)" } : {}}
            >
              {optimizing && <span className="spinner" />}
              {optimizing ? "Optimizing..." : <><Icon name="sparkles" size={15} /> Optimize ({selectedIds.size})</>}
            </button>
          )}
        </div>
      </header>

      {scanResult && (
        <div className={`alert ${scanResult.type === "error" ? "alert-error" : "alert-success"}`}>
          <Icon name={scanResult.type === "error" ? "xMark" : "checkCircle"} size={18} />
          {scanResult.message}
        </div>
      )}

      {stats?.activeScanJob && stats.activeScanJob.status === "FAILED" && (
        <div className="alert alert-error">
          <Icon name="xCircle" size={18} />
          <div style={{ flex: 1 }}>
            <div>Scan failed: {stats.activeScanJob.error || "Unknown error"}</div>
          </div>
        </div>
      )}

      {stats?.activeScanJob && (stats.activeScanJob.status === "QUEUED" || stats.activeScanJob.status === "PROCESSING") && (
        <div className="alert alert-info">
          <span className="spinner spinner-dark" />
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6 }}>Scanning: {stats.activeScanJob.scanned} / {stats.activeScanJob.total} images ({scanProgress}%)</div>
            <div className="polaris-progress">
              <div className="polaris-progress-bar" style={{ width: `${scanProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {stats && stats.activeOptimizationJobs > 0 && (
        <div className="alert alert-info">
          <span className="spinner spinner-dark" />
          {stats.activeOptimizationJobs} image(s) being optimized in background...
        </div>
      )}

      <section className="stats-grid">
        {statCards.map((card) => (
          <div key={card.label} className="polaris-card stat-card">
            <div className={`stat-icon ${card.iconClass}`}>
              <Icon name={card.icon} size={18} />
            </div>
            <span className="stat-label">{card.label}</span>
            <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </section>

      <div className="polaris-card">
        <div className="section-header">
          <h2><Icon name="image" size={18} /> Product Images</h2>
          <div className="section-controls">
            <div className="polaris-textfield-wrap">
              <Icon name="search" size={15} className="search-icon" />
              <input
                type="text"
                className="polaris-textfield"
                placeholder="Search images..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{ width: 220, paddingLeft: 34 }}
              />
            </div>
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
            <div className="empty-state-icon">
              <Icon name="camera" size={36} color="#0466c8" />
            </div>
            <h3>No images found</h3>
            <p>Click &quot;Scan Store&quot; to analyze your product images</p>
            <button
              className={`polaris-button ${(scanning || hasActiveScan) ? "polaris-button-outline" : "polaris-button-primary"}`}
              onClick={handleScan}
              disabled={scanning || !!hasActiveScan}
            >
              {(scanning || hasActiveScan) && <span className="spinner" />}
              {(scanning || hasActiveScan) ? "Scanning..." : <><Icon name="search" size={15} /> Scan Store</>}
            </button>
          </div>
        ) : (
          <table className="polaris-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: "center" }}>
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
                        className="image-thumb"
                      />
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#001233" }}>
                      {img.productName}
                    </td>
                    <td style={{ color: "#33415c", fontWeight: 500 }}>{formatBytes(img.originalBytes)}</td>
                    <td>
                      <span className="format-tag">
                        {img.format?.replace("image/", "").toUpperCase() ?? "N/A"}
                      </span>
                    </td>
                    <td style={{ color: img.potentialSavingsBytes ? "#dc2626" : "#7d8597", fontWeight: img.potentialSavingsBytes ? 600 : 400 }}>
                      {img.potentialSavingsBytes
                        ? `${formatBytes(img.potentialSavingsBytes)} (${img.reductionPercent}%)`
                        : "\u2014"}
                    </td>
                    <td>
                      <span className={`polaris-badge ${badge.className}`}>
                        <Icon name={badge.icon} size={12} color={badge.iconColor} /> {badge.label}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {img.status !== "OPTIMIZED" ? (
                        <button
                          className={`polaris-button ${optimizingId === img.id ? "polaris-button-outline" : "polaris-button-success"}`}
                          onClick={() => handleOptimizeSingle(img.id)}
                          disabled={optimizingId === img.id}
                          style={{ padding: "5px 14px", fontSize: 12 }}
                        >
                          {optimizingId === img.id && <span className="spinner" />}
                          {optimizingId === img.id ? "Working..." : <><Icon name="sparkles" size={12} /> Optimize</>}
                        </button>
                      ) : (
                        <span className="done-label"><Icon name="check" size={14} color="#059669" /> Done</span>
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
              Showing {(currentPage - 1) * 10 + 1}\u2013{Math.min(currentPage * 10, totalImages)} of {totalImages}
            </span>
            <div className="pagination-buttons">
              <button
                className="polaris-button polaris-button-outline"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: "5px 14px", fontSize: 13 }}
              >
                <Icon name="arrowLeft" size={14} /> Previous
              </button>
              <button
                className="polaris-button polaris-button-outline"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage * 10 >= totalImages}
                style={{ padding: "5px 14px", fontSize: 13 }}
              >
                Next <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
