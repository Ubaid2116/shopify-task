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
  totalSavingsBytes: number;
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

function getStatusColor(status: string): string {
  switch (status) {
    case "OPTIMIZED": return "#108043";
    case "RECOMMENDED": return "#B98900";
    case "HIGH_PRIORITY": return "#D72C0D";
    case "FAILED": return "#D72C0D";
    default: return "#6D7175";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "OPTIMIZED": return "Optimized";
    case "RECOMMENDED": return "Recommended";
    case "HIGH_PRIORITY": return "High Priority";
    case "FAILED": return "Failed";
    default: return status;
  }
}

export default function Home() {
  const [shop, setShop] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState("Starting authentication...");
  const [stats, setStats] = useState<Stats | null>(null);
  const [images, setImages] = useState<ImageData[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

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

  const fetchImages = useCallback(async (shopDomain: string, page: number, status: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10" });
      if (status !== "ALL") params.set("status", status);
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
        await fetchImages(data.shop, 1, "ALL");
      } catch (error) {
        setAuthStatus(error instanceof Error ? error.message : "Auth failed");
      }
    }
    authenticate();
  }, [fetchStats, fetchImages]);

  useEffect(() => {
    if (shop) {
      fetchImages(shop, currentPage, filter);
    }
  }, [shop, currentPage, filter, fetchImages]);

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
        setScanResult(`Scanned ${data.productsFound} products, ${data.imagesFound} images found`);
        await fetchStats(shop);
        await fetchImages(shop, 1, filter);
      } else {
        setScanResult(`Error: ${data.error}`);
      }
    } catch (e) {
      setScanResult("Scan failed");
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
        setScanResult(`Enqueued ${data.enqueued} images for optimization`);
        setSelectedIds(new Set());
        await fetchStats(shop);
      }
    } catch (e) {
      setScanResult("Optimization failed");
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
        setScanResult(`Optimized! Saved ${formatBytes(data.savingsBytes)} (${data.reductionPercent}% reduction)`);
        await fetchStats(shop);
        await fetchImages(shop, currentPage, filter);
      } else {
        setScanResult(`Error: ${data.error}`);
      }
    } catch {
      setScanResult("Optimization failed");
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
      <main style={{ padding: "40px", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 600, margin: "100px auto", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>StoreBoost Pro</h1>
          <p style={{ color: "#6D7175" }}>{authStatus}</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "24px", fontFamily: "system-ui, sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>StoreBoost Pro</h1>
          <p style={{ color: "#6D7175", margin: "4px 0 0" }}>Optimize your Shopify store images</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              padding: "8px 16px",
              backgroundColor: scanning ? "#E1E3E5" : "#006FBB",
              color: scanning ? "#6D7175" : "#fff",
              border: "none",
              borderRadius: 4,
              cursor: scanning ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
          >
            {scanning ? "Scanning..." : "Scan Store"}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleOptimizeSelected}
              disabled={optimizing}
              style={{
                padding: "8px 16px",
                backgroundColor: optimizing ? "#E1E3E5" : "#008060",
                color: optimizing ? "#6D7175" : "#fff",
                border: "none",
                borderRadius: 4,
                cursor: optimizing ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {optimizing ? "Optimizing..." : `Optimize Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
      </header>

      {scanResult && (
        <div style={{ padding: "12px 16px", marginBottom: 16, backgroundColor: scanResult.startsWith("Error") || scanResult.startsWith("Scan failed") ? "#FFF4F4" : "#F0F9FF", border: `1px solid ${scanResult.startsWith("Error") || scanResult.startsWith("Scan failed") ? "#FCBCB2" : "#B3D4FF"}`, borderRadius: 6, color: scanResult.startsWith("Error") || scanResult.startsWith("Scan failed") ? "#D72C0D" : "#006FBB" }}>
          {scanResult}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Images", value: stats?.totalImages ?? 0, color: "#006FBB" },
          { label: "Optimized", value: stats?.optimized ?? 0, color: "#108043" },
          { label: "Needs Optimization", value: (stats?.recommended ?? 0) + (stats?.highPriority ?? 0), color: "#B98900" },
          { label: "Potential Savings", value: formatBytes(stats?.totalSavingsBytes ?? 0), color: "#D72C0D" },
        ].map((card) => (
          <div key={card.label} style={{ padding: 20, backgroundColor: "#fff", border: "1px solid #E1E3E5", borderRadius: 8 }}>
            <div style={{ color: "#6D7175", fontSize: 13, marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </section>

      <section style={{ backgroundColor: "#fff", border: "1px solid #E1E3E5", borderRadius: 8 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E1E3E5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Product Images</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {["ALL", "OPTIMIZED", "RECOMMENDED", "HIGH_PRIORITY"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setCurrentPage(1); }}
                style={{
                  padding: "4px 12px",
                  fontSize: 13,
                  backgroundColor: filter === f ? "#006FBB" : "#F4F6F8",
                  color: filter === f ? "#fff" : "#374151",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {f === "ALL" ? "All" : f === "HIGH_PRIORITY" ? "High Priority" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#F4F6F8", textAlign: "left" }}>
              <th style={{ padding: "10px 16px", width: 40 }}>
                <input type="checkbox" checked={selectedIds.size === images.length && images.length > 0} onChange={toggleSelectAll} />
              </th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Image</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Product</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Dimensions</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Format</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Size</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Est. Savings</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Status</th>
              <th style={{ padding: "10px 12px", fontSize: 13, color: "#6D7175" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {images.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#6D7175" }}>
                  No images found. Click &quot;Scan Store&quot; to get started.
                </td>
              </tr>
            ) : (
              images.map((img) => (
                <tr key={img.id} style={{ borderTop: "1px solid #E1E3E5" }}>
                  <td style={{ padding: "10px 16px" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(img.id)}
                      onChange={() => toggleSelect(img.id)}
                    />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <img
                      src={img.sourceUrl}
                      alt={img.productName}
                      style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                    />
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 14, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.productName}</td>
                  <td style={{ padding: "10px 12px", fontSize: 14, color: "#6D7175" }}>{img.width && img.height ? `${img.width}x${img.height}` : "N/A"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 14, color: "#6D7175" }}>{img.format?.replace("image/", "").toUpperCase() ?? "N/A"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 14 }}>{formatBytes(img.originalBytes)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 14, color: "#D72C0D" }}>
                    {img.potentialSavingsBytes ? (
                      <span>{formatBytes(img.potentialSavingsBytes)} ({img.reductionPercent}%)</span>
                    ) : "N/A"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      padding: "2px 8px",
                      fontSize: 12,
                      borderRadius: 12,
                      backgroundColor: getStatusColor(img.status) + "15",
                      color: getStatusColor(img.status),
                      fontWeight: 500,
                    }}>
                      {getStatusLabel(img.status)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {img.status !== "OPTIMIZED" && (
                      <button
                        onClick={() => handleOptimizeSingle(img.id)}
                        disabled={optimizingId === img.id}
                        style={{
                          padding: "4px 12px",
                          fontSize: 12,
                          backgroundColor: optimizingId === img.id ? "#E1E3E5" : "#008060",
                          color: optimizingId === img.id ? "#6D7175" : "#fff",
                          border: "none",
                          borderRadius: 4,
                          cursor: optimizingId === img.id ? "not-allowed" : "pointer",
                          fontWeight: 500,
                        }}
                      >
                        {optimizingId === img.id ? "Optimizing..." : "Optimize"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalImages > 10 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #E1E3E5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#6D7175" }}>
              Showing {(currentPage - 1) * 10 + 1}-{Math.min(currentPage * 10, totalImages)} of {totalImages}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: "4px 12px", fontSize: 13, border: "1px solid #E1E3E5", borderRadius: 4, cursor: currentPage === 1 ? "not-allowed" : "pointer", backgroundColor: "#fff" }}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage * 10 >= totalImages}
                style={{ padding: "4px 12px", fontSize: 13, border: "1px solid #E1E3E5", borderRadius: 4, cursor: currentPage * 10 >= totalImages ? "not-allowed" : "pointer", backgroundColor: "#fff" }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
