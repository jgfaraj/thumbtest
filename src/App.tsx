import { useState, useRef, useCallback } from "react";

/*
 * ThumbTest — YouTube Thumbnail A/B Tester
 * Uses YouTube Data API v3 to fetch real search results
 *
 * Setup: Get your API key at console.cloud.google.com
 *   1. Create project → Enable YouTube Data API v3
 *   2. Create credentials → API Key
 *   3. Paste it into the app settings
 */

function formatViewCount(count) {
  const n = parseInt(count, 10);
  if (isNaN(n)) return count;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function timeAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diff = Math.floor((now - then) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
  return `${Math.floor(diff / 31536000)} years ago`;
}

function formatDuration(iso) {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = m[1] ? `${m[1]}:` : "";
  const min = m[2] || "0";
  const sec = (m[3] || "0").padStart(2, "0");
  return h ? `${h}${min.padStart(2, "0")}:${sec}` : `${min}:${sec}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── YouTube API ───────────────────────────────────────────────
async function fetchYouTubeResults(apiKey, query, maxResults = 8) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${apiKey}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `YouTube API error: ${searchRes.status}`);
  }
  const searchData = await searchRes.json();
  const videoIds = searchData.items.map((i) => i.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(",")}&key=${apiKey}`;
  const detailsRes = await fetch(detailsUrl);
  const detailsData = await detailsRes.json();
  const detailsMap = {};
  (detailsData.items || []).forEach((v) => { detailsMap[v.id] = v; });

  const channelIds = [...new Set(searchData.items.map((i) => i.snippet.channelId))];
  let channelMap = {};
  if (channelIds.length > 0) {
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelIds.join(",")}&key=${apiKey}`;
    const channelRes = await fetch(channelUrl);
    const channelData = await channelRes.json();
    (channelData.items || []).forEach((c) => {
      channelMap[c.id] = c.snippet.thumbnails?.default?.url || "";
    });
  }

  return searchData.items.map((item) => {
    const vid = item.id.videoId;
    const detail = detailsMap[vid];
    return {
      id: vid,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelAvatar: channelMap[item.snippet.channelId] || "",
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || "",
      publishedAt: item.snippet.publishedAt,
      viewCount: detail?.statistics?.viewCount || "0",
      duration: detail?.contentDetails?.duration || "",
    };
  });
}

// ─── Components ────────────────────────────────────────────────
function VideoCard({ thumbSrc, thumbEl, title, channelTitle, channelAvatar, viewCount, publishedAt, duration, isUser, label, highlightColor }) {
  const borderStyle = isUser ? `2px solid ${highlightColor || "#ff4757"}` : "2px solid transparent";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        borderRadius: 10, overflow: "hidden", border: borderStyle,
        boxShadow: isUser ? `0 0 20px ${highlightColor || "#ff4757"}33` : "none",
        position: "relative",
      }}>
        {isUser && label && (
          <div style={{
            position: "absolute", top: 8, left: 8, zIndex: 10,
            background: highlightColor || "#ff4757",
            color: "#fff", fontSize: 10, fontWeight: 700,
            padding: "3px 8px", borderRadius: 4,
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: "0.5px", textTransform: "uppercase",
          }}>{label}</div>
        )}
        {thumbEl || (
          <div style={{ position: "relative" }}>
            <img src={thumbSrc} alt="" style={{
              width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block", background: "#1a1a1f",
            }} />
            {duration && (
              <span style={{
                position: "absolute", bottom: 6, right: 6,
                background: "rgba(0,0,0,0.8)", color: "#fff",
                fontSize: 11, fontWeight: 600, padding: "2px 5px",
                borderRadius: 3, fontFamily: "'DM Sans', sans-serif",
              }}>{duration}</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: isUser ? (highlightColor || "#ff4757") : "#333",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif",
        }}>
          {channelAvatar
            ? <img src={channelAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : (channelTitle || "?")[0]}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: "#e8e8e8", lineHeight: 1.3,
            fontFamily: "'DM Sans', sans-serif",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{title}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3, fontFamily: "'DM Sans', sans-serif" }}>{channelTitle}</div>
          <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>
            {viewCount}{publishedAt ? ` · ${publishedAt}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadZone({ onUpload, label, color, thumbnail, onRemove }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const handleFile = useCallback((file) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => onUpload(e.target.result);
      reader.readAsDataURL(file);
    }
  }, [onUpload]);

  if (thumbnail) {
    return (
      <div style={{ position: "relative", borderRadius: 12, border: `2px solid ${color}`, overflow: "hidden", aspectRatio: "16/9" }}>
        <img src={thumbnail} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <button onClick={onRemove} style={{
          position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.7)",
          border: "none", color: "#fff", width: 26, height: 26, borderRadius: "50%",
          cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          background: `linear-gradient(transparent, ${color}44)`, padding: "16px 10px 6px",
          fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase",
          letterSpacing: "0.5px", fontFamily: "'DM Sans', sans-serif",
        }}>{label}</div>
      </div>
    );
  }
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
      style={{
        borderRadius: 12, border: `2px dashed ${dragOver ? color : "#444"}`,
        background: dragOver ? `${color}11` : "#1a1a1f",
        aspectRatio: "16/9", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", cursor: "pointer",
        transition: "all 0.2s ease", gap: 8,
      }}
    >
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files[0])} />
      <div style={{
        width: 44, height: 44, borderRadius: "50%", border: `2px solid ${color}55`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <span style={{ fontSize: 12, color: "#888", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Upload {label}</span>
      <span style={{ fontSize: 10, color: "#555", fontFamily: "'DM Sans', sans-serif" }}>1280×720 recommended</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "#888", fontWeight: 600, display: "block", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", padding: "10px 14px", background: "#0f0f13", border: "1px solid #333",
        borderRadius: 8, color: "#e8e8e8", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
        outline: "none", boxSizing: "border-box",
      }} />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: "3px solid #222", borderTopColor: "#ff4757",
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{ fontSize: 13, color: "#666", fontFamily: "'DM Sans', sans-serif" }}>Fetching real YouTube results...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ResultGrid({ items, renderCard, colMin = 280 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gap: 20 }}>
      {items.map(renderCard)}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────
export default function ThumbTest() {
  const [apiKey, setApiKey] = useState("");
  const [apiInput, setApiInput] = useState("");
  const [thumbA, setThumbA] = useState(null);
  const [thumbB, setThumbB] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [channelName, setChannelName] = useState("");
  const [insertPos, setInsertPos] = useState(2);
  const [showPreview, setShowPreview] = useState(false);
  const [view, setView] = useState("grid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ytResults, setYtResults] = useState([]);

  const canPreview = thumbA && searchQuery && apiKey;

  const handlePreview = async () => {
    if (!canPreview) return;
    setLoading(true);
    setError("");
    try {
      const results = await fetchYouTubeResults(apiKey, searchQuery, 8);
      if (results.length === 0) {
        setError("No results found for that query. Try a different search term.");
        return;
      }
      setYtResults(results);
      setShowPreview(true);
    } catch (e) {
      setError(e.message || "Failed to fetch YouTube results. Check your API key.");
    } finally {
      setLoading(false);
    }
  };

  const userChannelName = channelName || "Your Channel";

  const buildResults = (thumb, label, color) => {
    const mapped = ytResults.map((r) => ({ ...r, isUser: false }));
    const pos = Math.min(insertPos, mapped.length);
    mapped.splice(pos, 0, { id: `user-${label}`, isUser: true, thumb, label, color });
    return mapped;
  };

  const renderCard = (r) =>
    r.isUser ? (
      <VideoCard key={r.id}
        thumbEl={
          <div style={{ position: "relative" }}>
            <img src={r.thumb} alt="Your thumbnail" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
          </div>
        }
        title={videoTitle || "Your Video Title Goes Here"}
        channelTitle={userChannelName} channelAvatar={null}
        viewCount="— views" publishedAt="Just now"
        isUser label={r.label} highlightColor={r.color}
      />
    ) : (
      <VideoCard key={r.id}
        thumbSrc={r.thumbnail} title={r.title}
        channelTitle={r.channelTitle} channelAvatar={r.channelAvatar}
        viewCount={formatViewCount(r.viewCount)}
        publishedAt={timeAgo(r.publishedAt)}
        duration={formatDuration(r.duration)}
      />
    );

  // ═══════ PREVIEW VIEW ═══════
  if (showPreview) {
    const resultsA = buildResults(thumbA, "Version A", "#ff4757");
    const resultsB = thumbB ? buildResults(thumbB, "Version B", "#2ed573") : null;

    return (
      <div style={{ minHeight: "100vh", background: "#0f0f13", fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
        {/* Sticky top bar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(15,15,19,0.92)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid #222", padding: "10px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setShowPreview(false)} style={{
              background: "#1e1e24", border: "1px solid #333", color: "#ccc", borderRadius: 8,
              padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Edit
            </button>
            <div style={{
              background: "#ff475718", border: "1px solid #ff475533", borderRadius: 8,
              padding: "4px 10px", fontSize: 12, color: "#ff6b7a", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              "{searchQuery}"
            </div>
            <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>{ytResults.length} real results</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["grid", "Grid"], ["side", "A / B"]].map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? "#ff4757" : "#1e1e24",
                border: view === v ? "1px solid #ff4757" : "1px solid #333",
                color: view === v ? "#fff" : "#888", borderRadius: 6, padding: "5px 12px",
                cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.5px", fontFamily: "'DM Sans', sans-serif",
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "24px 20px", maxWidth: 1400, margin: "0 auto" }}>
          {view === "grid" ? (
            <>
              <div style={{ fontSize: 11, color: "#ff6b7a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                {resultsB ? "Version A" : "Your Thumbnail"} — Results for "{searchQuery}"
              </div>
              <ResultGrid items={resultsA} renderCard={renderCard} />
              {resultsB && (
                <>
                  <div style={{ height: 1, background: "#222", margin: "32px 0" }} />
                  <div style={{ fontSize: 11, color: "#2ed573", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                    Version B — Results for "{searchQuery}"
                  </div>
                  <ResultGrid items={resultsB} renderCard={renderCard} />
                </>
              )}
            </>
          ) : (
            <div style={{ display: "flex", gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, color: "#ff6b7a", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "1px", marginBottom: 16, textAlign: "center",
                  background: "#ff475711", borderRadius: 8, padding: 8,
                }}>Version A</div>
                <ResultGrid items={resultsA} renderCard={renderCard} colMin={220} />
              </div>
              {resultsB && (
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 11, color: "#2ed573", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "1px", marginBottom: 16, textAlign: "center",
                    background: "#2ed57311", borderRadius: 8, padding: 8,
                  }}>Version B</div>
                  <ResultGrid items={resultsB} renderCard={renderCard} colMin={220} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════ EDITOR VIEW ═══════
  return (
    <div style={{ minHeight: "100vh", background: "#0f0f13", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />

      {/* Hero */}
      <div style={{ position: "relative", padding: "48px 20px 36px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, #ff475712 0%, transparent 60%)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "linear-gradient(135deg, #ff4757 0%, #ff6b7a 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 20px #ff475744",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <span style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "'Space Mono', monospace", letterSpacing: "-0.5px" }}>ThumbTest</span>
          </div>
          <p style={{ fontSize: 15, color: "#888", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
            Preview your thumbnail against <strong style={{ color: "#ccc" }}>real YouTube competitors</strong> before you publish.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 60px" }}>

        {/* API Key Section */}
        <div style={{ background: "#16161b", borderRadius: 16, border: "1px solid #222", padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px" }}>
              YouTube API Key
            </div>
            {apiKey && (
              <div style={{ fontSize: 11, fontWeight: 600, color: "#2ed573", display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2ed573" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Connected
              </div>
            )}
          </div>
          {!apiKey ? (
            <>
              <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, margin: "0 0 12px", fontFamily: "'DM Sans', sans-serif" }}>
                To show real competitor thumbnails, connect a free YouTube Data API key.
              </p>
              <div style={{ fontSize: 12, color: "#777", lineHeight: 2, margin: "0 0 14px", fontFamily: "'DM Sans', sans-serif" }}>
                <span style={{ color: "#555", fontWeight: 700, marginRight: 6 }}>1.</span> Go to <span style={{ color: "#ff6b7a" }}>console.cloud.google.com</span><br/>
                <span style={{ color: "#555", fontWeight: 700, marginRight: 6 }}>2.</span> Create a project → Enable <strong style={{ color: "#ccc" }}>YouTube Data API v3</strong><br/>
                <span style={{ color: "#555", fontWeight: 700, marginRight: 6 }}>3.</span> Credentials → <strong style={{ color: "#ccc" }}>API Key</strong><br/>
                <span style={{ color: "#555", fontWeight: 700, marginRight: 6 }}>4.</span> Paste it below
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={apiInput} onChange={(e) => setApiInput(e.target.value)}
                  placeholder="AIzaSy..." type="password"
                  onKeyDown={(e) => { if (e.key === "Enter" && apiInput.trim()) setApiKey(apiInput.trim()); }}
                  style={{
                    flex: 1, padding: "10px 14px", background: "#0f0f13", border: "1px solid #333",
                    borderRadius: 8, color: "#e8e8e8", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
                  }} />
                <button onClick={() => { if (apiInput.trim()) setApiKey(apiInput.trim()); }}
                  disabled={!apiInput.trim()} style={{
                    padding: "10px 20px", borderRadius: 8, border: "none",
                    background: apiInput.trim() ? "#ff4757" : "#2a2a30",
                    color: apiInput.trim() ? "#fff" : "#555",
                    fontWeight: 700, fontSize: 13, cursor: apiInput.trim() ? "pointer" : "not-allowed",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>Save</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "#666", fontFamily: "monospace" }}>
                {apiKey.slice(0, 8)}{"•".repeat(16)}{apiKey.slice(-4)}
              </span>
              <button onClick={() => { setApiKey(""); setApiInput(""); }} style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid #333",
                background: "#1e1e24", color: "#888", fontSize: 12, cursor: "pointer",
                fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              }}>Change</button>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        <div style={{ background: "#16161b", borderRadius: 16, border: "1px solid #222", padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 16 }}>
            Thumbnails
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <UploadZone onUpload={setThumbA} label="Version A" color="#ff4757" thumbnail={thumbA} onRemove={() => setThumbA(null)} />
            <UploadZone onUpload={setThumbB} label="Version B" color="#2ed573" thumbnail={thumbB} onRemove={() => setThumbB(null)} />
          </div>
        </div>

        {/* Video Details */}
        <div style={{ background: "#16161b", borderRadius: 16, border: "1px solid #222", padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 16 }}>
            Video Details
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Search Query *" value={searchQuery} onChange={setSearchQuery} placeholder="e.g. how to edit videos on iPhone" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Video Title" value={videoTitle} onChange={setVideoTitle} placeholder="Your Video Title Goes Here" />
              <Field label="Channel Name" value={channelName} onChange={setChannelName} placeholder="Your Channel" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#888", fontWeight: 600, display: "block", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
                Position in Results: {ordinal(insertPos + 1)}
              </label>
              <input type="range" min="0" max="7" value={insertPos}
                onChange={(e) => setInsertPos(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#ff4757" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginTop: 2 }}>
                <span>Top</span><span>Bottom</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "#2a1015", border: "1px solid #ff475544", borderRadius: 10,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#ff6b7a",
            fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "flex-start", gap: 8,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* CTA */}
        {loading ? <Spinner /> : (
          <button onClick={handlePreview} disabled={!canPreview} style={{
            width: "100%", padding: 16,
            background: canPreview ? "linear-gradient(135deg, #ff4757 0%, #ff6b7a 100%)" : "#2a2a30",
            border: "none", borderRadius: 12,
            color: canPreview ? "#fff" : "#555",
            fontSize: 15, fontWeight: 800, fontFamily: "'DM Sans', sans-serif",
            cursor: canPreview ? "pointer" : "not-allowed",
            letterSpacing: "0.5px",
            boxShadow: canPreview ? "0 4px 24px #ff475744" : "none",
            transition: "all 0.2s ease",
          }}>
            {!apiKey ? "Add your YouTube API key to get started"
              : !thumbA ? "Upload at least one thumbnail"
              : !searchQuery ? "Enter a search query"
              : "Preview Against Real Competitors →"}
          </button>
        )}

        {/* Steps */}
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { n: "1", title: "Connect", desc: "Add your free YouTube API key" },
            { n: "2", title: "Upload", desc: "Add up to 2 thumbnail versions" },
            { n: "3", title: "Preview", desc: "See them in real search results" },
          ].map((step) => (
            <div key={step.n} style={{
              background: "#16161b", borderRadius: 12, border: "1px solid #1e1e24",
              padding: "20px 16px", textAlign: "center",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "#1e1e24",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 800, color: "#ff6b7a", marginBottom: 8,
                fontFamily: "'Space Mono', monospace",
              }}>{step.n}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ccc", marginBottom: 4 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}