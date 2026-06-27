"use client";
import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────
// AI PROMPTS
// ─────────────────────────────────────────────────────────────────
const CAROUSEL_PROMPT = `You generate Instagram carousel content for 2117 Rental — a premium cinema equipment rental house in Seri Kembangan, Selangor, Malaysia.

BRAND VOICE: Confident, direct, set-ready technician who's also a filmmaker. No fluff, but never cold. Speak in shoot-type language (TVC, feature, content creation). Name exact cameras/lenses/accessories. Address real producer constraints (budget, crew size, schedule). Bilingual EN/BM acceptable where natural but default to EN. Em-dashes as list markers, never bullets. Never "best-in-class," "industry-leading," "cutting-edge," "game-changing," "premium experience."

PACKAGES:
CREATOR READY — RM1,500/day. Best for: content creation, YouTube, social media, short films, student films, music videos (budget), corporate video, documentary. Camera (pick 1): Sony Venice 2 8K, ARRI Alexa Mini LF, ARRI Alexa 35. Lens set (pick 1): ZERO Optik Leica-R (PL) 6-lens, DZOFilm Arles Primes 7-lens, Zeiss Super Speed S35 5-lens. Includes: SmallHD 702, Vaxis Cine 8, 2x Atomos Sumo 19" monitors, Vaxis 1000S Storm wireless, MB-T12 Mattebox, Tilta Nucleus-M, Teris 100mm Tripod System, Senior Magliner.

COMMERCIAL PRO — RM3,000/day. "Precision. Control. Built for set." Best for: TVC, brand films, high-end commercial, multi-camera setups. Camera (pick 1): RED V-Raptor 8K, Sony Burano 8K. Lens set (pick 1): Cooke SP3 6-lens, Sigma Cine FF High Speed Primes 7-lens, Contax Zeiss Super Speed Rehoused 7-lens. Includes: SmallHD 702, Atomos Sumo 19", Vaxis Cine 8, Vaxis 1000S Storm wireless, MB-T12 Mattebox, Tilta Nucleus-M, 8x SWIT 140Wh + 4x SWIT 210Wh batteries, Sachtler Video 25 Plus Tripod, Senior Magliner.

SIGNATURE SERIES — RM4,500/day. "Bold. Powerful. Made to stand out." Best for: feature films, drama series, prestige productions, high-profile TVCs. Camera (pick 1): Sony Venice 2 8K (Rialto on request), ARRI Alexa Mini LF, ARRI Alexa 35. Lens set (pick 1): ZERO Optik Leica-R (PL) 6-lens, DZOFilm Arles Primes 7-lens, Zeiss Super Speed S35 5-lens. Includes: SmallHD 702, Vaxis Cine 8, 2x Atomos Sumo 19" director's monitors, Vaxis 1000S Storm wireless, MB-T12 Mattebox, Tilta Nucleus-M, 12x SWIT 140Wh + 6x SWIT 220Wh + 5x SWIT HB-A290B (Alexa 35 only) batteries, O'Connor Ultimate 2560 Tripod, Senior Magliner.

ALL PACKAGES: Subject to availability, first-come first-served. Collection one day before shoot, return one day after. 6% SST. Cash/bank transfer. 50/50 payment option on qualifying totals.

INDIVIDUAL LENS CATALOGUE (beyond packages): ARRI Signature Prime Core Set (LPL), Atlas Orion Anamorphic Set, Atlas Mercury 1.5x Full-Frame Anamorphic, Zeiss Super Speed MKiii Set A+B, Contax Zeiss Super Speed Rehoused (GL Optics), Richard Gale Clavius Primes (PL), Sigma Cine FF High Speed Primes, LOMO Super Speeds PL, Cooke SP3 (E-Mount), Blazar Remus 1.5x Anamorphic Set, Contax Zeiss AEJ Primes (EF), Olympus Zuiko Vintage Primes (5/8-lens EF), Canon nFD Vintage Primes (EF), DZOFilm Vespid Primes (EF), DULENS APO Primes (EF), Leica-R Summicron 5-Lens Set (EF), DZOFilm Pictor Zooms 20-55+50-125 T2.8, DZOFilm CATTA Ace FF, Laowa Ranger FF 75-180mm T2.9, Laowa 24mm T8 Pro2be (PL), Laowa 24mm T14 Probe+PeriProbe (PL), Laowa 12mm T2.9 Zero-D Cine, Aivascope 1.5x Anamorphic (Amber Flare), ARRI Master Macro 100mm T2.0, Sony G Master Primes+Zooms, ZEISS Distagon 15mm f/2.8, Helios 44M 58mm F2, Venus Optics Laowa Probe Zoom Bundle, Atlas Orion 25mm T2 Anamorphic.

INDIVIDUAL CAMERAS: Sony Venice 2 8K (RM6,000/day), Venice 2 8K w/ Rialto (RM5,000/day), Venice 6K (RM2,000/day), Venice 6K w/ Rialto (RM3,000/day), ARRI Alexa 35 (RM5,000/day), ARRI Alexa Mini LF.

STUDIO: 1, Jalan Teras 3, Taman Industri Selesa Jaya, 43300 Seri Kembangan, Selangor.

Respond ONLY in valid JSON. No markdown. No preamble.
{"post_concept":"one-line concept","caption":"full caption ready to post, \\n for breaks, no markdown","hashtags":["#2117Rental","...max 12"],"slides":[{"number":1,"layout":"cover|spec|body|cta","headline":"main display text max 55 chars","subhead":"tracked label max 35 chars or null","body":"supporting text max 90 chars or null","accent":"gold highlight text max 40 chars or null"}]}
LAYOUTS: cover=bold opener headline w/ price; spec=numbered gear list slide; body=headline+supporting info; cta=closing call-to-action with DM prompt. First slide=cover. Last slide=cta.`;

const REEL_PROMPT = `You generate Instagram Reel storyboard documents for 2117 Rental, a premium cinema equipment rental house in Seri Kembangan, Selangor, Malaysia.

Brand: Confident, direct, technician-filmmaker tone. Packages: Creator Ready (RM1,500/day), Commercial Pro (RM3,000/day), Signature Series (RM4,500/day). Gear: ARRI Alexa 35/Mini LF, Sony Venice 2/Burano, RED V-Raptor, plus 30+ cinema lens sets (Atlas Mercury anamorphic, ARRI Signature Primes, Cooke SP3, vintage Olympus Zuiko, Laowa Probe). Aesthetic: dark gear photography, Tusker Grotesk headlines, gold accent (#EEDFA3), real studio/set footage over staged content.

SHOT TYPES: ECU=extreme close-up, CU=close-up, MS=medium shot, WS=wide shot, OTS=over-shoulder, MACRO=extreme detail, TITLE=text/graphic frame
MOVEMENTS: STATIC, TRACK, PAN, TILT, HANDHELD, PUSH, PULL

Respond ONLY in valid JSON. No markdown. No preamble.
{"reel_title":"short title","audio_direction":"music/sound brief max 60 chars","frames":[{"number":1,"timecode":"0:00–0:03","duration_seconds":3,"shot_type":"ECU|CU|MS|WS|OTS|MACRO|TITLE","movement":"STATIC|TRACK|PAN|TILT|HANDHELD|PUSH|PULL","subject":"what is in frame max 50 chars","composition":"framing note max 60 chars","screen_text":"on-screen text or null","vo":"voiceover or sound note or null"}]}
Generate 8 frames for 30s, 12 for 60s. Durations must sum to total. Always end with a TITLE frame (screen_text = 2 1 1 7   R E N T A L).`;

const STORY_PROMPT = `You generate Instagram Story slide content for 2117 Rental — a premium cinema equipment rental house in Seri Kembangan, Selangor, Malaysia.

BRAND VOICE: Confident, direct, set-ready technician who's also a filmmaker. No fluff, but never cold. Shoot-type language (TVC, feature, content creation). Name exact cameras/lenses. Address real producer constraints. Bilingual EN/BM acceptable where natural but default to EN. Em-dashes as list markers, never bullets. Never "best-in-class," "industry-leading," "cutting-edge," "game-changing," "premium experience."

FORMAT: 9:16 vertical Stories. Each slide is a full-screen frame. Safe zone: keep key text in middle 60% vertically (avoid top/bottom 20% — UI chrome).

PACKAGES:
CREATOR READY — RM1,500/day. Sony Venice 2 8K / ARRI Alexa Mini LF / ARRI Alexa 35 + prime lens set. Content creation, YouTube, short films, docs.
COMMERCIAL PRO — RM3,000/day. RED V-Raptor 8K / Sony Burano 8K + cinema lens set. TVC, brand films, commercial.
SIGNATURE SERIES — RM4,500/day. Sony Venice 2 8K / ARRI Alexa Mini LF / ARRI Alexa 35 + premium primes. Features, drama series, prestige TVCs.

LAYOUTS:
- cover: Bold opener. Large headline, minimal text. Sets the hook.
- stat: Single striking stat or spec. One big number/fact + short label.
- list: Em-dash gear/feature list. Max 4 items. Tight, scannable.
- cta: Closing slide. DM prompt, link-in-bio, or booking nudge.

Respond ONLY in valid JSON. No markdown. No preamble.
{"story_concept":"one-line concept","slides":[{"number":1,"layout":"cover|stat|list|cta","headline":"main display text max 40 chars","subhead":"tracked label max 30 chars or null","body":"supporting text or em-dash list max 100 chars or null","accent":"gold highlight text max 35 chars or null","tap_cta":"swipe/tap prompt max 25 chars or null"}]}
First slide must be cover. Last slide must be cta. Middle slides use stat or list.`;

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────
const PILLARS = [
  { id: "package",  label: "Package Spotlight" },
  { id: "gear",      label: "Gear Deep-Dive" },
  { id: "onset",     label: "On Set / BTS" },
  { id: "guide",     label: "Shoot-Type Guide" },
  { id: "studio",    label: "Studio & Logistics" },
];
const PRODUCTS = [
  { id: "any",        label: "Pillar decides" },
  { id: "creator",    label: "Creator Ready (RM1,500)" },
  { id: "commercial", label: "Commercial Pro (RM3,000)" },
  { id: "signature",  label: "Signature Series (RM4,500)" },
  { id: "venice2",    label: "Sony Venice 2 8K" },
  { id: "alexa35",    label: "ARRI Alexa 35" },
  { id: "anamorphic", label: "Anamorphic Lens Sets" },
  { id: "vintage",    label: "Vintage Lens Sets" },
];
const SHOT_META = {
  ECU:   { color: "#EEDFA3", label: "EXTREME C/U" },
  CU:    { color: "#CBD6D2", label: "CLOSE-UP" },
  MS:    { color: "#8AADBE", label: "MED. SHOT" },
  WS:    { color: "#5A6E87", label: "WIDE SHOT" },
  OTS:   { color: "#A09070", label: "OVER SHOULDER" },
  MACRO: { color: "#EEDFA3", label: "MACRO" },
  TITLE: { color: "#FFFFFF", label: "TITLE CARD" },
};
const LOADING_MSGS = [
  "Checking the gear wall...", "Pulling the spec sheet...",
  "Loading the kit list...", "Confirming availability...", "Almost there...",
];

// ─────────────────────────────────────────────────────────────────
// STORY RENDERER (9:16)
// ─────────────────────────────────────────────────────────────────
function StoryPreview({ slide, number, total }) {
  if (!slide) return null;
  const { layout, headline, subhead, body, accent, tap_cta } = slide;
  const base = {
    width: "100%", aspectRatio: "9/16", background: "#000",
    position: "relative", display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center", padding: "12% 9%",
    fontFamily: "'Satoshi', sans-serif", overflow: "hidden",
    border: "1px solid #1a1a1a",
  };

  // progress bar strip
  const progress = (
    <div style={{ position: "absolute", top: "4%", left: "5%", right: "5%", display: "flex", gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 2, borderRadius: 2,
          background: i < number ? "rgba(238,223,163,0.9)" : "rgba(255,255,255,0.2)",
        }} />
      ))}
    </div>
  );

  const logo = (
    <div style={{ position: "absolute", bottom: "5%", left: 0, right: 0, textAlign: "center",
      fontFamily: "'Jost', sans-serif", fontSize: "clamp(6px,1.5vw,8px)",
      letterSpacing: "0.4em", color: "rgba(238,223,163,0.5)", fontWeight: 300 }}>
      2 1 1 7   R E N T A L
    </div>
  );

  const tapCta = tap_cta && (
    <div style={{ position: "absolute", bottom: "10%", left: 0, right: 0, textAlign: "center",
      fontFamily: "'Satoshi', sans-serif", fontSize: "clamp(6px,1.3vw,8px)",
      letterSpacing: "0.2em", color: "rgba(238,223,163,0.7)", fontWeight: 500 }}>
      ▲  {tap_cta.toUpperCase()}
    </div>
  );

  const accentEl = accent && (
    <div style={{ fontFamily: "'Satoshi', sans-serif", fontSize: "clamp(7px,1.4vw,9px)",
      letterSpacing: "0.2em", color: "#EEDFA3", marginTop: "5%", fontWeight: 600 }}>
      {accent}
    </div>
  );

  if (layout === "cover") return (
    <div style={base}>
      {progress}
      <div style={{ textAlign: "center", width: "100%" }}>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.2vw,8px)", letterSpacing: "0.3em",
          color: "rgba(238,223,163,0.6)", marginBottom: "6%", fontWeight: 500 }}>
          {subhead.toUpperCase()}
        </div>}
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(26px,7vw,46px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.02em",
          lineHeight: 1.05, marginBottom: "5%" }}>
          {headline}
        </div>
        <div style={{ width: "36px", height: "2px", background: "#EEDFA3", margin: "0 auto", opacity: 0.8 }} />
        {body && <div style={{ marginTop: "5%", fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(7px,1.5vw,10px)", color: "rgba(203,214,210,0.7)",
          lineHeight: 1.6, fontWeight: 400 }}>{body}</div>}
        {accentEl}
      </div>
      {tapCta}{logo}
    </div>
  );

  if (layout === "stat") return (
    <div style={base}>
      {progress}
      <div style={{ textAlign: "center", width: "100%" }}>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.2vw,8px)", letterSpacing: "0.3em",
          color: "rgba(238,223,163,0.6)", marginBottom: "4%", fontWeight: 500 }}>
          {subhead.toUpperCase()}
        </div>}
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(40px,13vw,88px)", fontWeight: 800,
          color: "#EEDFA3", textTransform: "uppercase", lineHeight: 1 }}>
          {headline}
        </div>
        {body && <div style={{ marginTop: "5%", fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(7px,1.5vw,10px)", color: "rgba(203,214,210,0.75)",
          lineHeight: 1.6, fontWeight: 400 }}>{body}</div>}
      </div>
      {tapCta}{logo}
    </div>
  );

  if (layout === "list") return (
    <div style={base}>
      {progress}
      <div style={{ width: "100%" }}>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.1vw,8px)", letterSpacing: "0.3em",
          color: "rgba(238,223,163,0.65)", marginBottom: "4%", fontWeight: 600 }}>
          {subhead.toUpperCase()}
        </div>}
        <div style={{ width: "28px", height: "2px", background: "#EEDFA3", marginBottom: "4%" }} />
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(18px,4.5vw,30px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", lineHeight: 1.2, marginBottom: "5%" }}>
          {headline}
        </div>
        {body && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(7px,1.5vw,10px)", color: "rgba(203,214,210,0.8)",
          lineHeight: 1.9, fontWeight: 400, whiteSpace: "pre-line" }}>{body}</div>}
        {accentEl}
      </div>
      {tapCta}{logo}
    </div>
  );

  if (layout === "cta") return (
    <div style={{ ...base, justifyContent: "center" }}>
      {progress}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px",
        background: "linear-gradient(90deg, transparent, #EEDFA3, transparent)", opacity: 0.5 }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: "clamp(8px,1.6vw,10px)",
          letterSpacing: "0.4em", color: "#EEDFA3", fontWeight: 300, marginBottom: "5%" }}>
          2 1 1 7   R E N T A L
        </div>
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(22px,6vw,40px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", lineHeight: 1.15, marginBottom: "6%" }}>
          {headline}
        </div>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.2vw,8px)", letterSpacing: "0.2em",
          color: "rgba(203,214,210,0.6)", marginBottom: "3%" }}>
          {subhead.toUpperCase()}
        </div>}
        {body && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.2vw,8px)", letterSpacing: "0.12em",
          color: "rgba(238,223,163,0.6)", fontWeight: 600 }}>{body}</div>}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
        background: "linear-gradient(90deg, transparent, #EEDFA3, transparent)", opacity: 0.5 }} />
      {tapCta}
    </div>
  );

  return (
    <div style={base}>
      {progress}
      <div style={{ width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(22px,5.5vw,36px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", lineHeight: 1.1 }}>
          {headline}
        </div>
        {body && <div style={{ marginTop: "5%", fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(7px,1.4vw,9px)", color: "rgba(203,214,210,0.75)",
          lineHeight: 1.65, fontWeight: 400 }}>{body}</div>}
      </div>
      {tapCta}{logo}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SLIDE RENDERER
// ─────────────────────────────────────────────────────────────────
function SlidePreview({ slide, number, total }) {
  if (!slide) return null;
  const { layout, headline, subhead, body, accent } = slide;
  const base = {
    width: "100%", aspectRatio: "4/5", background: "#000",
    position: "relative", display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center", padding: "10% 9%",
    fontFamily: "'Satoshi', sans-serif", overflow: "hidden",
    border: "1px solid #1a1a1a",
  };
  const logo = (
    <div style={{ position: "absolute", bottom: "5%", left: 0, right: 0, textAlign: "center",
      fontFamily: "'Jost', sans-serif", fontSize: "clamp(6px,1.2vw,9px)",
      letterSpacing: "0.4em", color: "rgba(238,223,163,0.5)", fontWeight: 300 }}>
      2 1 1 7   R E N T A L
    </div>
  );
  const counter = (
    <div style={{ position: "absolute", top: "4%", right: "5%",
      fontFamily: "'IBM Plex Mono', monospace", fontSize: "clamp(7px,1.1vw,9px)",
      color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
      {number}/{total}
    </div>
  );
  const accentEl = accent && (
    <div style={{ fontFamily: "'Satoshi', sans-serif", fontSize: "clamp(7px,1.3vw,10px)",
      letterSpacing: "0.25em", color: "#EEDFA3", marginTop: "6%", fontWeight: 600 }}>
      {accent}
    </div>
  );

  if (layout === "cover") return (
    <div style={base}>
      {counter}
      <div style={{ textAlign: "center", width: "100%" }}>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.1vw,9px)", letterSpacing: "0.3em",
          color: "rgba(238,223,163,0.6)", marginBottom: "8%", fontWeight: 500 }}>
          {subhead.toUpperCase()}
        </div>}
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(22px,5.5vw,40px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.02em",
          lineHeight: 1.1, marginBottom: "6%" }}>
          {headline}
        </div>
        <div style={{ width: "40px", height: "2px", background: "#EEDFA3", margin: "0 auto", opacity: 0.8 }} />
        {body && <div style={{ marginTop: "6%", fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(8px,1.4vw,11px)", color: "rgba(203,214,210,0.7)",
          lineHeight: 1.6, fontWeight: 400 }}>{body}</div>}
        {accentEl}
      </div>
      {logo}
    </div>
  );

  if (layout === "spec") return (
    <div style={base}>
      {counter}
      <div style={{ width: "100%" }}>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.1vw,9px)", letterSpacing: "0.3em",
          color: "rgba(238,223,163,0.65)", marginBottom: "6%", fontWeight: 600 }}>
          {subhead.toUpperCase()}
        </div>}
        <div style={{ width: "30px", height: "2px", background: "#EEDFA3", marginBottom: "6%" }} />
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(16px,3.6vw,26px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", lineHeight: 1.25, marginBottom: "6%" }}>
          {headline}
        </div>
        {body && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(8px,1.5vw,11.5px)", color: "rgba(203,214,210,0.8)",
          lineHeight: 1.8, fontWeight: 400, whiteSpace: "pre-line" }}>{body}</div>}
        {accentEl}
      </div>
      {logo}
    </div>
  );

  if (layout === "cta") return (
    <div style={{ ...base, justifyContent: "center" }}>
      {counter}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px",
        background: "linear-gradient(90deg, transparent, #EEDFA3, transparent)", opacity: 0.5 }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: "clamp(10px,2vw,14px)",
          letterSpacing: "0.4em", color: "#EEDFA3", fontWeight: 300, marginBottom: "6%" }}>
          2 1 1 7   R E N T A L
        </div>
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(18px,4vw,28px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", lineHeight: 1.2, marginBottom: "8%" }}>
          {headline}
        </div>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(7px,1.2vw,9px)", letterSpacing: "0.25em",
          color: "rgba(203,214,210,0.6)", marginBottom: "4%" }}>
          {subhead.toUpperCase()}
        </div>}
        {body && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(7px,1.2vw,9px)", letterSpacing: "0.15em",
          color: "rgba(238,223,163,0.6)", fontWeight: 600 }}>{body}</div>}
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
        background: "linear-gradient(90deg, transparent, #EEDFA3, transparent)", opacity: 0.5 }} />
    </div>
  );

  return (
    <div style={base}>
      {counter}
      <div style={{ width: "100%" }}>
        {subhead && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(6px,1.1vw,9px)", letterSpacing: "0.3em",
          color: "rgba(238,223,163,0.65)", marginBottom: "5%", fontWeight: 500 }}>
          {subhead.toUpperCase()}
        </div>}
        <div style={{ width: "30px", height: "2px", background: "#EEDFA3", marginBottom: "5%" }} />
        <div style={{ fontFamily: "'Tusker Grotesk', sans-serif",
          fontSize: "clamp(18px,4vw,28px)", fontWeight: 800,
          color: "#FFFFFF", textTransform: "uppercase", lineHeight: 1.2, marginBottom: "6%" }}>
          {headline}
        </div>
        {body && <div style={{ fontFamily: "'Satoshi', sans-serif",
          fontSize: "clamp(8px,1.4vw,11px)", color: "rgba(203,214,210,0.75)",
          lineHeight: 1.65, fontWeight: 400 }}>{body}</div>}
        {accentEl}
      </div>
      {logo}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SHOT GUIDE SVG
// ─────────────────────────────────────────────────────────────────
function ShotGuide({ shotType }) {
  const c = "#EEDFA3", o = 0.18;
  const guides = {
    ECU:   <><rect x="28%" y="15%" width="44%" height="70%" fill="none" stroke={c} strokeWidth="1" opacity={o*1.8}/><line x1="50%" y1="15%" x2="50%" y2="85%" stroke={c} strokeWidth="0.5" opacity={o}/></>,
    CU:    <><ellipse cx="50%" cy="36%" rx="18%" ry="22%" fill="none" stroke={c} strokeWidth="1" opacity={o*1.8}/></>,
    MS:    <><line x1="10%" y1="55%" x2="90%" y2="55%" stroke={c} strokeWidth="1" opacity={o*1.8}/><rect x="30%" y="10%" width="40%" height="45%" fill="none" stroke={c} strokeWidth="0.5" opacity={o}/></>,
    WS:    <><line x1="0" y1="33%" x2="100%" y2="33%" stroke={c} strokeWidth="0.5" opacity={o}/><line x1="0" y1="66%" x2="100%" y2="66%" stroke={c} strokeWidth="0.5" opacity={o}/><line x1="33%" y1="0" x2="33%" y2="100%" stroke={c} strokeWidth="0.5" opacity={o}/><line x1="66%" y1="0" x2="66%" y2="100%" stroke={c} strokeWidth="0.5" opacity={o}/></>,
    OTS:   <><ellipse cx="22%" cy="45%" rx="14%" ry="20%" fill="none" stroke={c} strokeWidth="0.5" opacity={o}/><rect x="35%" y="20%" width="45%" height="55%" fill="none" stroke={c} strokeWidth="1" opacity={o*1.8}/></>,
    MACRO: <><circle cx="50%" cy="50%" r="30%" fill="none" stroke={c} strokeWidth="1" opacity={o*2}/><circle cx="50%" cy="50%" r="8%" fill="none" stroke={c} strokeWidth="0.5" opacity={o}/></>,
    TITLE: <><rect x="10%" y="35%" width="80%" height="30%" fill="none" stroke={c} strokeWidth="0.5" opacity={o}/></>,
  };
  return (
    <svg viewBox="0 0 100 100" style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }} preserveAspectRatio="none">
      {guides[shotType] || guides.WS}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// STORYBOARD FRAME CELL
// ─────────────────────────────────────────────────────────────────
function FrameCell({ frame }) {
  const meta = SHOT_META[frame.shot_type] || SHOT_META.WS;
  return (
    <div style={{ flexShrink:0, width:148, display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{ width:148, height:263, background:"#111110", border:"1px solid #252520", position:"relative", overflow:"hidden" }}>
        <ShotGuide shotType={frame.shot_type} />
        <div style={{ position:"absolute", top:6, left:6, background:"rgba(0,0,0,0.85)",
          border:`1px solid ${meta.color}`, padding:"2px 6px",
          fontFamily:"'IBM Plex Mono',monospace", fontSize:7, color:meta.color, letterSpacing:"0.1em", zIndex:2 }}>
          {frame.shot_type}
        </div>
        <div style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.7)",
          padding:"2px 5px", fontFamily:"'IBM Plex Mono',monospace",
          fontSize:7, color:"rgba(255,255,255,0.4)", letterSpacing:"0.05em" }}>
          {frame.movement}
        </div>
        <div style={{ position:"absolute", bottom:28, left:0, right:0,
          padding:"0 8px", textAlign:"center",
          fontFamily:"'Satoshi',sans-serif", fontSize:8,
          color:"rgba(203,214,210,0.7)", lineHeight:1.4 }}>
          {frame.subject}
        </div>
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:20,
          background:"rgba(0,0,0,0.9)", borderTop:"1px solid #252520",
          display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 6px" }}>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:7, color:"rgba(255,255,255,0.3)" }}>{frame.timecode}</span>
          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:7, color:"#EEDFA3", background:"rgba(238,223,163,0.1)", padding:"1px 4px" }}>{frame.duration_seconds}s</span>
        </div>
        <div style={{ position:"absolute", top:6, left:"50%", transform:"translateX(-50%)",
          fontFamily:"'IBM Plex Mono',monospace", fontSize:8, color:"rgba(255,255,255,0.2)" }}>
          {String(frame.number).padStart(2,"0")}
        </div>
      </div>
      {frame.screen_text && (
        <div style={{ padding:"4px 6px", background:"rgba(238,223,163,0.06)",
          border:"1px solid rgba(238,223,163,0.15)", borderLeft:"2px solid #EEDFA3" }}>
          <div style={{ fontFamily:"'Satoshi',sans-serif", fontSize:8, fontWeight:600,
            color:"rgba(238,223,163,0.5)", letterSpacing:"0.1em", marginBottom:2 }}>TEXT</div>
          <div style={{ fontFamily:"'Satoshi',sans-serif", fontSize:8.5, color:"#EEDFA3", lineHeight:1.4 }}>"{frame.screen_text}"</div>
        </div>
      )}
      {frame.vo && (
        <div style={{ padding:"4px 6px", background:"#111110", border:"1px solid #252520" }}>
          <div style={{ fontFamily:"'Satoshi',sans-serif", fontSize:8, fontWeight:600,
            color:"rgba(203,214,210,0.35)", letterSpacing:"0.1em", marginBottom:2 }}>VO / SFX</div>
          <div style={{ fontFamily:"'Satoshi',sans-serif", fontSize:8.5,
            color:"rgba(203,214,210,0.6)", lineHeight:1.4, fontStyle:"italic" }}>{frame.vo}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────
export default function RentalStudio() {
  const [tab, setTab]               = useState("carousel");
  const [pillar, setPillar]         = useState("");
  const [product, setProduct]       = useState("any");
  const [notes, setNotes]           = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [carouselData, setCarouselData] = useState(null);
  const [activeSlide, setActiveSlide]   = useState(0);
  const [duration, setDuration]     = useState(30);
  const [reelData, setReelData]     = useState(null);
  const [storyCount, setStoryCount] = useState(3);
  const [storyData, setStoryData]   = useState(null);
  const [activeStory, setActiveStory] = useState(0);
  const [loading, setLoading]       = useState(false);
  const [loadIdx, setLoadIdx]       = useState(0);
  const [error, setError]           = useState(null);
  const [library, setLibrary]       = useState([]);
  const [copied, setCopied]         = useState("");
  const [exporting, setExporting]   = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rental_posts");
      if (saved) setLibrary(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setLoadIdx(i => (i + 1) % LOADING_MSGS.length), 1800);
    return () => clearInterval(iv);
  }, [loading]);

  const callClaude = async (systemPrompt, userMsg) => {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: systemPrompt, message: userMsg }),
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text || "";
    return JSON.parse(raw.replace(/```json\n?|```\n?/g, "").trim());
  };

  const generateCarousel = async () => {
    if (!pillar) return;
    setLoading(true); setError(null); setCarouselData(null); setActiveSlide(0);
    try {
      const pLabel  = PILLARS.find(p => p.id === pillar)?.label;
      const prLabel = PRODUCTS.find(p => p.id === product)?.label;
      const parsed  = await callClaude(
        CAROUSEL_PROMPT,
        `Generate a ${slideCount}-slide Instagram carousel.\nPillar: ${pLabel}\nProduct: ${prLabel}\n${notes ? `Direction: ${notes}` : "No extra direction."}`
      );
      setCarouselData(parsed);
    } catch { setError("Generation failed — check your API key and try again."); }
    setLoading(false);
  };

  const generateReel = async () => {
    if (!pillar) return;
    setLoading(true); setError(null); setReelData(null);
    try {
      const pLabel  = PILLARS.find(p => p.id === pillar)?.label;
      const prLabel = PRODUCTS.find(p => p.id === product)?.label;
      const parsed  = await callClaude(
        REEL_PROMPT,
        `Generate a ${duration}-second Instagram Reel storyboard.\nPillar: ${pLabel}\nProduct: ${prLabel}\n${notes ? `Direction: ${notes}` : "No extra direction."}`
      );
      setReelData(parsed);
    } catch { setError("Generation failed — check your API key and try again."); }
    setLoading(false);
  };

  const generateStory = async () => {
    if (!pillar) return;
    setLoading(true); setError(null); setStoryData(null); setActiveStory(0);
    try {
      const pLabel  = PILLARS.find(p => p.id === pillar)?.label;
      const prLabel = PRODUCTS.find(p => p.id === product)?.label;
      const parsed  = await callClaude(
        STORY_PROMPT,
        `Generate a ${storyCount}-slide Instagram Story sequence.\nPillar: ${pLabel}\nProduct: ${prLabel}\n${notes ? `Direction: ${notes}` : "No extra direction."}`
      );
      setStoryData(parsed);
    } catch { setError("Generation failed — check your API key and try again."); }
    setLoading(false);
  };

  const savePost = () => {
    if (!carouselData) return;
    const entry   = { ...carouselData, id: Date.now(), saved_at: new Date().toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) };
    const updated = [entry, ...library];
    setLibrary(updated);
    try { localStorage.setItem("rental_posts", JSON.stringify(updated)); } catch {}
    setCopied("saved"); setTimeout(() => setCopied(""), 1800);
  };

  const deletePost = (id) => {
    const updated = library.filter(p => p.id !== id);
    setLibrary(updated);
    try { localStorage.setItem("rental_posts", JSON.stringify(updated)); } catch {}
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(""), 1800);
  };

  // ── Canvas export ──
  const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = (text || "").split(" ");
    let line = "", curY = y;
    for (let n = 0; n < words.length; n++) {
      const test = line + words[n] + " ";
      if (ctx.measureText(test).width > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, curY);
        line = words[n] + " ";
        curY += lineHeight;
      } else { line = test; }
    }
    ctx.fillText(line.trim(), x, curY);
    return curY;
  };

  const drawStoryToCanvas = (ctx, slide, num, total) => {
    const W = 1080, H = 1920, pad = 90;
    const { layout, headline, subhead, body, accent, tap_cta } = slide;

    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

    // progress dots
    const dotW = (W - pad * 2 - (total - 1) * 8) / total;
    for (let d = 0; d < total; d++) {
      ctx.fillStyle = d < num ? "rgba(238,223,163,0.9)" : "rgba(255,255,255,0.25)";
      const rx = pad + d * (dotW + 8), ry = 56;
      ctx.beginPath(); ctx.roundRect(rx, ry, dotW, 3, 2); ctx.fill();
    }

    // logo bottom
    ctx.font = "300 19px 'Jost', sans-serif";
    ctx.fillStyle = "rgba(238,223,163,0.5)"; ctx.textAlign = "center";
    ctx.fillText("2 1 1 7   R E N T A L", W / 2, H - 80);

    // tap cta
    if (tap_cta) {
      ctx.font = "500 20px 'Satoshi', sans-serif";
      ctx.fillStyle = "rgba(238,223,163,0.7)"; ctx.textAlign = "center";
      ctx.fillText("▲  " + tap_cta.toUpperCase(), W / 2, H - 130);
    }

    if (layout === "cover") {
      if (subhead) {
        ctx.font = "500 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.6)"; ctx.textAlign = "center";
        ctx.fillText(subhead.toUpperCase(), W / 2, 760);
      }
      ctx.font = "800 88px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      wrapText(ctx, headline.toUpperCase(), W / 2, 900, W - pad * 2, 100);
      ctx.strokeStyle = "rgba(238,223,163,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W/2 - 50, 1030); ctx.lineTo(W/2 + 50, 1030); ctx.stroke();
      if (body) {
        ctx.font = "400 26px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.7)"; ctx.textAlign = "center";
        wrapText(ctx, body, W / 2, 1090, W - pad * 2, 38);
      }
      if (accent) {
        ctx.font = "600 24px 'Satoshi', sans-serif";
        ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "center";
        ctx.fillText(accent, W / 2, 1220);
      }
    } else if (layout === "stat") {
      if (subhead) {
        ctx.font = "500 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.6)"; ctx.textAlign = "center";
        ctx.fillText(subhead.toUpperCase(), W / 2, 760);
      }
      ctx.font = "800 140px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "center";
      ctx.fillText(headline.toUpperCase(), W / 2, 960);
      if (body) {
        ctx.font = "400 28px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.75)"; ctx.textAlign = "center";
        wrapText(ctx, body, W / 2, 1050, W - pad * 2, 40);
      }
    } else if (layout === "list") {
      if (subhead) {
        ctx.font = "600 20px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.65)"; ctx.textAlign = "left";
        ctx.fillText(subhead.toUpperCase(), pad, 740);
      }
      ctx.strokeStyle = "rgba(238,223,163,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pad, 768); ctx.lineTo(pad + 72, 768); ctx.stroke();
      ctx.font = "800 68px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      let ly = wrapText(ctx, headline.toUpperCase(), pad, 870, W - pad * 2, 80);
      if (body) {
        ctx.font = "400 26px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.8)"; ctx.textAlign = "left";
        const lines = body.split("\n");
        let gy = ly + 60;
        for (const l of lines) { ctx.fillText(l, pad, gy); gy += 44; }
      }
      if (accent) {
        ctx.font = "600 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "left";
        ctx.fillText(accent, pad, 1380);
      }
    } else if (layout === "cta") {
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, "transparent"); grad.addColorStop(0.5, "rgba(238,223,163,0.5)"); grad.addColorStop(1, "transparent");
      ctx.strokeStyle = grad; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(W, 3); ctx.stroke();
      ctx.font = "300 28px 'Jost', sans-serif";
      ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "center";
      ctx.fillText("2 1 1 7   R E N T A L", W / 2, 840);
      ctx.font = "800 80px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      wrapText(ctx, headline.toUpperCase(), W / 2, 980, W - pad * 2, 92);
      if (subhead) {
        ctx.font = "400 24px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.6)"; ctx.textAlign = "center";
        ctx.fillText(subhead.toUpperCase(), W / 2, 1130);
      }
      if (body) {
        ctx.font = "600 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.65)"; ctx.textAlign = "center";
        ctx.fillText(body, W / 2, 1200);
      }
      const grad2 = ctx.createLinearGradient(0, 0, W, 0);
      grad2.addColorStop(0, "transparent"); grad2.addColorStop(0.5, "rgba(238,223,163,0.5)"); grad2.addColorStop(1, "transparent");
      ctx.strokeStyle = grad2; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, H - 3); ctx.lineTo(W, H - 3); ctx.stroke();
    }
  };

  const drawSlideToCanvas = (ctx, slide, num, total) => {
    const W = 1080, H = 1350, pad = 100;
    const { layout, headline, subhead, body, accent } = slide;

    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.font = "300 20px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.textAlign = "right";
    ctx.fillText(`${num}/${total}`, W - pad, 72);
    ctx.font = "300 17px 'Jost', sans-serif";
    ctx.fillStyle = "rgba(238,223,163,0.5)"; ctx.textAlign = "center";
    ctx.fillText("2 1 1 7   R E N T A L", W / 2, H - 52);

    if (layout === "cover") {
      if (subhead) {
        ctx.font = "500 20px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.6)"; ctx.textAlign = "center";
        ctx.fillText(subhead.toUpperCase(), W / 2, 440);
      }
      ctx.font = "800 70px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      wrapText(ctx, headline.toUpperCase(), W / 2, 570, W - pad * 2, 82);
      ctx.strokeStyle = "rgba(238,223,163,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W/2-44, 670); ctx.lineTo(W/2+44, 670); ctx.stroke();
      if (body) {
        ctx.font = "400 24px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.7)"; ctx.textAlign = "center";
        wrapText(ctx, body, W / 2, 730, W - pad * 2, 34);
      }
      if (accent) {
        ctx.font = "600 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "center";
        ctx.fillText(accent, W / 2, 860);
      }
    } else if (layout === "cta") {
      const grad = ctx.createLinearGradient(0,0,W,0);
      grad.addColorStop(0,"transparent"); grad.addColorStop(0.5,"rgba(238,223,163,0.5)"); grad.addColorStop(1,"transparent");
      ctx.strokeStyle = grad; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0,3); ctx.lineTo(W,3); ctx.stroke();
      ctx.font = "300 30px 'Jost', sans-serif";
      ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "center";
      ctx.fillText("2 1 1 7   R E N T A L", W / 2, 530);
      ctx.font = "800 60px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      wrapText(ctx, headline.toUpperCase(), W / 2, 660, W - pad * 2, 72);
      if (subhead) {
        ctx.font = "400 20px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.6)"; ctx.textAlign = "center";
        ctx.fillText(subhead.toUpperCase(), W / 2, 830);
      }
      if (body) {
        ctx.font = "600 19px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.6)"; ctx.textAlign = "center";
        ctx.fillText(body, W / 2, 890);
      }
      const grad2 = ctx.createLinearGradient(0,0,W,0);
      grad2.addColorStop(0,"transparent"); grad2.addColorStop(0.5,"rgba(238,223,163,0.5)"); grad2.addColorStop(1,"transparent");
      ctx.strokeStyle = grad2; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0,H-3); ctx.lineTo(W,H-3); ctx.stroke();
    } else {
      // spec or body layout
      if (subhead) {
        ctx.font = "600 19px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(238,223,163,0.65)"; ctx.textAlign = "left";
        ctx.fillText(subhead.toUpperCase(), pad, 420);
      }
      ctx.strokeStyle = "rgba(238,223,163,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pad, 448); ctx.lineTo(pad + 64, 448); ctx.stroke();
      ctx.font = "800 56px 'Tusker Grotesk', sans-serif";
      ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      let curY = wrapText(ctx, headline.toUpperCase(), pad, 540, W - pad * 2, 66);
      if (body) {
        ctx.font = "400 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "rgba(203,214,210,0.8)"; ctx.textAlign = "left";
        const lines = body.split("\n");
        let ly = curY + 70;
        for (const l of lines) { ctx.fillText(l, pad, ly); ly += 38; }
      }
      if (accent) {
        ctx.font = "600 22px 'Satoshi', sans-serif";
        ctx.fillStyle = "#EEDFA3"; ctx.textAlign = "left";
        ctx.fillText(accent, pad, 1050);
      }
    }
  };

  const exportSlides = async () => {
    if (!slides.length) return;
    setExporting(true);
    await document.fonts.ready;
    for (let i = 0; i < slides.length; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      drawSlideToCanvas(ctx, slides[i], i + 1, slides.length);
      const link = document.createElement("a");
      link.download = `2117-slide-${String(i + 1).padStart(2, "0")}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
      await new Promise(r => setTimeout(r, 350));
    }
    setExporting(false);
  };

  const exportStories = async () => {
    if (!storySlides.length) return;
    setExporting(true);
    await document.fonts.ready;
    for (let i = 0; i < storySlides.length; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      drawStoryToCanvas(ctx, storySlides[i], i + 1, storySlides.length);
      const link = document.createElement("a");
      link.download = `2117-story-${String(i + 1).padStart(2, "0")}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
      await new Promise(r => setTimeout(r, 350));
    }
    setExporting(false);
  };

  const slides      = carouselData?.slides || [];
  const frames      = reelData?.frames || [];
  const storySlides = storyData?.slides || [];
  const canGen  = !!pillar && !loading;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,300;0,400;1,300&family=IBM+Plex+Mono:wght@300;400&display=swap');
    @import url('https://api.fontshare.com/v2/css?f[]=tusker-grotesk@700,800&f[]=satoshi@400,500,700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#000;--bg2:#111110;--bg3:#191917;--bg4:#212120;
      --acc:#EEDFA3;--acc2:rgba(238,223,163,0.12);--acc3:rgba(238,223,163,0.35);
      --t1:#FFF;--t2:#CBD6D2;--t3:#5A6E87;
      --bdr:#252520;
      --ff:'Satoshi',system-ui,sans-serif;--fd:'Tusker Grotesk',sans-serif;--fl:'Jost',sans-serif;--fm:'IBM Plex Mono',monospace;
    }
    body{background:var(--bg)}
    ::-webkit-scrollbar{width:3px;height:3px}
    ::-webkit-scrollbar-track{background:var(--bg)}
    ::-webkit-scrollbar-thumb{background:var(--bdr)}
    ::-webkit-scrollbar-thumb:hover{background:var(--acc3)}
    .studio{background:var(--bg);min-height:100vh;color:var(--t1);display:flex;flex-direction:column}
    .hdr{display:flex;align-items:baseline;justify-content:space-between;padding:22px 28px 18px;border-bottom:1px solid var(--bdr)}
    .hdr-brand{font-family:var(--fl);font-size:10px;font-weight:300;letter-spacing:.45em;color:var(--acc)}
    .hdr-sub{font-family:var(--ff);font-size:11px;font-weight:400;color:var(--t3);letter-spacing:.08em}
    .tabs{display:flex;border-bottom:1px solid var(--bdr);padding:0 28px}
    .tb{background:none;border:none;border-bottom:1px solid transparent;margin-bottom:-1px;padding:12px 20px 10px;font-family:var(--ff);font-size:10px;font-weight:500;letter-spacing:.2em;color:var(--t3);cursor:pointer;transition:color .15s,border-color .15s}
    .tb:hover{color:var(--t2)}.tb.on{color:var(--acc);border-bottom-color:var(--acc)}
    .layout{display:grid;grid-template-columns:268px 1fr;flex:1;min-height:0}
    .sidebar{border-right:1px solid var(--bdr);padding:24px 20px;display:flex;flex-direction:column;gap:22px;overflow-y:auto}
    .fl{font-family:var(--ff);font-size:8px;font-weight:600;letter-spacing:.25em;color:var(--t3);margin-bottom:8px;display:block}
    .pgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    .pbtn{background:var(--bg2);border:1px solid var(--bdr);padding:9px 8px;text-align:left;cursor:pointer;transition:all .15s;border-radius:1px}
    .pbtn:hover{border-color:var(--acc3)}.pbtn.on{background:var(--acc2);border-color:var(--acc3)}
    .pbtn-n{font-family:var(--ff);font-size:9.5px;font-weight:500;color:var(--t2);display:block;line-height:1.3}
    .pbtn.on .pbtn-n{color:var(--acc)}
    .row{display:flex;gap:5px;flex-wrap:wrap}
    .chip{background:var(--bg2);border:1px solid var(--bdr);padding:6px 10px;font-family:var(--ff);font-size:9px;font-weight:500;letter-spacing:.1em;color:var(--t3);cursor:pointer;transition:all .15s;border-radius:1px;white-space:nowrap}
    .chip:hover{border-color:var(--t3);color:var(--t2)}.chip.on{background:var(--acc2);border-color:var(--acc3);color:var(--acc)}
    .sel{width:100%;background:var(--bg2);border:1px solid var(--bdr);color:var(--t1);padding:9px 10px;font-family:var(--ff);font-size:10px;border-radius:1px;appearance:none;cursor:pointer}
    .sel:focus{outline:none;border-color:var(--acc3)}
    .ta{width:100%;background:var(--bg2);border:1px solid var(--bdr);color:var(--t1);padding:10px;font-family:var(--ff);font-size:10px;resize:none;border-radius:1px;min-height:60px}
    .ta::placeholder{color:var(--t3)}.ta:focus{outline:none;border-color:var(--acc3)}
    .genbtn{width:100%;padding:13px;background:var(--acc);border:none;color:#000;font-family:var(--ff);font-size:9px;font-weight:700;letter-spacing:.25em;cursor:pointer;transition:opacity .15s;border-radius:1px;margin-top:auto}
    .genbtn:hover:not(:disabled){opacity:.85}.genbtn:disabled{opacity:.25;cursor:not-allowed}
    .main{overflow:hidden;display:flex;flex-direction:column}
    .main-inner{flex:1;overflow-y:auto;padding:28px;display:flex;flex-direction:column;gap:24px}
    .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:360px;gap:10px;color:var(--t3);text-align:center}
    .empty-t{font-family:var(--fd);font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .empty-s{font-family:var(--ff);font-size:9px;letter-spacing:.2em}
    .loading{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:360px;gap:14px}
    .load-line{width:48px;height:1px;background:var(--acc);animation:lp 1.8s ease-in-out infinite}
    @keyframes lp{0%,100%{opacity:.2;width:48px}50%{opacity:1;width:80px}}
    .load-msg{font-family:var(--fm);font-size:10px;color:var(--t3);letter-spacing:.1em}
    .err{background:rgba(255,60,60,.08);border:1px solid rgba(255,60,60,.25);padding:12px 14px;font-family:var(--fm);font-size:10px;color:#ff8080;border-radius:1px}
    .slide-wrap{max-width:380px;width:100%;margin:0 auto}
    .dots{display:flex;justify-content:center;gap:6px;padding:12px 0}
    .dot{width:5px;height:5px;border-radius:50%;background:var(--bdr);cursor:pointer;transition:background .15s}
    .dot.on{background:var(--acc)}
    .slide-nav{display:flex;justify-content:space-between;align-items:center;padding:0 0 4px}
    .nav-btn{background:none;border:1px solid var(--bdr);padding:6px 14px;font-family:var(--fm);font-size:9px;color:var(--t3);cursor:pointer;border-radius:1px;transition:all .15s}
    .nav-btn:hover:not(:disabled){color:var(--acc);border-color:var(--acc3)}.nav-btn:disabled{opacity:.2;cursor:not-allowed}
    .caption-block{background:var(--bg2);border:1px solid var(--bdr);border-left:2px solid var(--acc3);padding:14px;white-space:pre-wrap;font-family:var(--fm);font-size:10px;line-height:1.7;color:var(--t2)}
    .ht-wrap{display:flex;flex-wrap:wrap;gap:5px}
    .ht{background:var(--bg3);border:1px solid var(--bdr);padding:4px 9px;font-family:var(--fm);font-size:9px;color:var(--t3);border-radius:1px}
    .sec-label{font-family:var(--ff);font-size:8px;font-weight:600;letter-spacing:.25em;color:var(--t3);display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .hr{width:100%;height:1px;background:var(--bdr);margin:4px 0 20px}
    .acts{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}
    .abtn{background:none;border:1px solid var(--bdr);padding:9px 14px;font-family:var(--ff);font-size:8px;font-weight:600;letter-spacing:.15em;color:var(--t3);cursor:pointer;border-radius:1px;transition:all .15s}
    .abtn:hover{color:var(--t1);border-color:var(--t2)}
    .abtn.pri{background:var(--acc);color:#000;border-color:var(--acc)}.abtn.pri:hover{opacity:.85}
    .abtn.cp{border-color:var(--acc);color:var(--acc)}
    .cpbtn{background:none;border:none;font-family:var(--ff);font-size:8px;font-weight:600;letter-spacing:.15em;color:var(--t3);cursor:pointer;transition:color .15s}
    .cpbtn:hover,.cpbtn.cp{color:var(--acc)}
    .sb-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--bdr);margin-bottom:4px}
    .sb-title{font-family:var(--fd);font-size:22px;font-weight:800;text-transform:uppercase;color:var(--t1);line-height:1.2}
    .sb-audio{font-family:var(--fm);font-size:9px;color:var(--t3);margin-top:6px;letter-spacing:.05em}
    .sb-meta{font-family:var(--fm);font-size:9px;color:var(--acc);letter-spacing:.1em;white-space:nowrap}
    .sb-scroll{overflow-x:auto;padding-bottom:12px}
    .sb-frames{display:flex;gap:12px;padding:4px 2px 8px;width:max-content}
    .sb-hint{font-family:var(--fm);font-size:9px;color:var(--t3);letter-spacing:.1em;opacity:.5;margin-bottom:8px}
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="studio">

        <header className="hdr">
          <span className="hdr-brand">2 1 1 7   R E N T A L</span>
          <span className="hdr-sub">content studio</span>
        </header>

        <nav className="tabs">
          <button className={`tb ${tab==="carousel"?"on":""}`} onClick={() => setTab("carousel")}>CAROUSEL</button>
          <button className={`tb ${tab==="reel"?"on":""}`} onClick={() => setTab("reel")}>REEL STORYBOARD</button>
          <button className={`tb ${tab==="story"?"on":""}`} onClick={() => setTab("story")}>IG STORY</button>
        </nav>

        <div className="layout">
          <div className="sidebar">
            <div>
              <span className="fl">C O N T E N T   P I L L A R</span>
              <div className="pgrid">
                {PILLARS.map(p => (
                  <button key={p.id} className={`pbtn ${pillar===p.id?"on":""}`} onClick={() => setPillar(p.id)}>
                    <span className="pbtn-n">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {tab === "carousel" && (
              <div>
                <span className="fl">S L I D E   C O U N T</span>
                <div className="row">
                  {[5,7].map(n => (
                    <button key={n} className={`chip ${slideCount===n?"on":""}`} onClick={() => setSlideCount(n)}>{n} SLIDES</button>
                  ))}
                </div>
              </div>
            )}

            {tab === "reel" && (
              <div>
                <span className="fl">D U R A T I O N</span>
                <div className="row">
                  {[30,60].map(d => (
                    <button key={d} className={`chip ${duration===d?"on":""}`} onClick={() => setDuration(d)}>{d}S REEL</button>
                  ))}
                </div>
              </div>
            )}

            {tab === "story" && (
              <div>
                <span className="fl">S L I D E   C O U N T</span>
                <div className="row">
                  {[3,5].map(n => (
                    <button key={n} className={`chip ${storyCount===n?"on":""}`} onClick={() => setStoryCount(n)}>{n} SLIDES</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="fl">P A C K A G E   /   G E A R</span>
              <div style={{ position:"relative" }}>
                <select className="sel" value={product} onChange={e => setProduct(e.target.value)}>
                  {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"var(--acc)", pointerEvents:"none", fontSize:10 }}>▾</span>
              </div>
            </div>

            <div>
              <span className="fl">D I R E C T I O N   ·   O P T I O N A L</span>
              <textarea className="ta" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Specific shoot type, gear combo, upcoming production..." />
            </div>

            {!pillar && <span style={{ fontFamily:"var(--fm)", fontSize:8, color:"var(--t3)", letterSpacing:".1em" }}>← SELECT A PILLAR FIRST</span>}

            <button className="genbtn" disabled={!canGen}
              onClick={tab==="carousel" ? generateCarousel : tab==="reel" ? generateReel : generateStory}>
              {loading ? "GENERATING..." : tab==="carousel" ? "GENERATE CAROUSEL" : tab==="reel" ? "GENERATE STORYBOARD" : "GENERATE STORY"}
            </button>
          </div>

          <div className="main">
            <div className="main-inner">
              {error && <div className="err">⚠ {error}</div>}

              {loading && (
                <div className="loading">
                  <div className="load-line" />
                  <span className="load-msg">{LOADING_MSGS[loadIdx]}</span>
                </div>
              )}

              {tab==="carousel" && !loading && !carouselData && !error && (
                <div className="empty">
                  <span className="empty-t">Carousel preview.</span>
                  <span className="empty-s">P I C K   A   P I L L A R   ·   H I T   G E N E R A T E</span>
                </div>
              )}

              {tab==="carousel" && !loading && carouselData && (
                <>
                  <div className="slide-wrap">
                    <div className="slide-nav">
                      <button className="nav-btn" disabled={activeSlide===0} onClick={() => setActiveSlide(i=>i-1)}>← PREV</button>
                      <span style={{ fontFamily:"var(--fm)", fontSize:9, color:"var(--t3)" }}>{activeSlide+1} / {slides.length}</span>
                      <button className="nav-btn" disabled={activeSlide===slides.length-1} onClick={() => setActiveSlide(i=>i+1)}>NEXT →</button>
                    </div>
                    <SlidePreview slide={slides[activeSlide]} number={activeSlide+1} total={slides.length} />
                    <div className="dots">
                      {slides.map((_,i) => <div key={i} className={`dot ${i===activeSlide?"on":""}`} onClick={() => setActiveSlide(i)} />)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontFamily:"var(--fd)", fontSize:17, fontWeight:700, textTransform:"uppercase", color:"var(--t2)", marginBottom:20 }}>
                      {carouselData.post_concept}
                    </div>
                    <div className="hr" />
                    <div className="sec-label">
                      <span>C A P T I O N</span>
                      <button className={`cpbtn ${copied==="cap"?"cp":""}`} onClick={() => copy(carouselData.caption,"cap")}>
                        {copied==="cap"?"COPIED ✓":"COPY"}
                      </button>
                    </div>
                    <div className="caption-block">{carouselData.caption}</div>
                    <div style={{ marginTop:16, marginBottom:10 }} className="sec-label">
                      <span>H A S H T A G S</span>
                      <button className={`cpbtn ${copied==="ht"?"cp":""}`} onClick={() => copy(carouselData.hashtags?.join(" "),"ht")}>
                        {copied==="ht"?"COPIED ✓":"COPY"}
                      </button>
                    </div>
                    <div className="ht-wrap">
                      {carouselData.hashtags?.map(h => <span key={h} className="ht">{h}</span>)}
                    </div>
                    <div className="acts">
                      <button className={`abtn pri ${copied==="saved"?"cp":""}`} onClick={savePost}>
                        {copied==="saved"?"SAVED ✓":"SAVE POST"}
                      </button>
                      <button className={`abtn ${copied==="full"?"cp":""}`} onClick={() => copy(`${carouselData.caption}\n\n${carouselData.hashtags?.join(" ")}`, "full")}>
                        {copied==="full"?"COPIED ✓":"COPY FULL POST"}
                      </button>
                      <button className="abtn pri" onClick={exportSlides} disabled={exporting} style={{ opacity: exporting ? 0.6 : 1 }}>
                        {exporting ? "EXPORTING..." : `↓ EXPORT ${slides.length} SLIDES`}
                      </button>
                      <button className="abtn" onClick={generateCarousel}>REGENERATE</button>
                    </div>
                  </div>

                  {library.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div className="hr" />
                      <div className="sec-label"><span>S A V E D   P O S T S   ({library.length})</span></div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {library.map(p => (
                          <div key={p.id} style={{ background:"var(--bg2)", border:"1px solid var(--bdr)", padding:"10px 12px",
                            display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                            <span style={{ fontFamily:"var(--fd)", fontSize:12, fontWeight:700, textTransform:"uppercase", color:"var(--t2)", flex:1 }}>
                              {p.post_concept}
                            </span>
                            <span style={{ fontFamily:"var(--fm)", fontSize:8, color:"var(--t3)", whiteSpace:"nowrap" }}>{p.saved_at}</span>
                            <button style={{ background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:14, lineHeight:1 }}
                              onClick={() => deletePost(p.id)}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab==="reel" && !loading && !reelData && !error && (
                <div className="empty">
                  <span className="empty-t">Storyboard.</span>
                  <span className="empty-s">P I C K   A   P I L L A R   ·   H I T   G E N E R A T E</span>
                </div>
              )}

              {tab==="story" && !loading && !storyData && !error && (
                <div className="empty">
                  <span className="empty-t">Story preview.</span>
                  <span className="empty-s">P I C K   A   P I L L A R   ·   H I T   G E N E R A T E</span>
                </div>
              )}

              {tab==="reel" && !loading && reelData && (
                <>
                  <div className="sb-header">
                    <div>
                      <div className="sb-title">{reelData.reel_title}</div>
                      <div className="sb-audio">♪ {reelData.audio_direction}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                      <span className="sb-meta">{duration}S · {frames.length} FRAMES</span>
                      <button className="abtn" onClick={generateReel}>REGENERATE</button>
                    </div>
                  </div>
                  <div className="sb-hint">← SCROLL TO SEE ALL FRAMES</div>
                  <div className="sb-scroll">
                    <div className="sb-frames">
                      {frames.map(f => <FrameCell key={f.number} frame={f} />)}
                    </div>
                  </div>
                  <div>
                    <div className="sec-label" style={{ marginBottom:8 }}><span>S H O T   L E G E N D</span></div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {Object.entries(SHOT_META).map(([k,v]) => (
                        <span key={k} style={{ fontFamily:"var(--fm)", fontSize:8, padding:"3px 7px",
                          border:`1px solid ${v.color}30`, color:v.color, background:`${v.color}08`, letterSpacing:".08em" }}>
                          {k} — {v.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="acts">
                    <button className={`abtn ${copied==="brief"?"cp":""}`}
                      onClick={() => copy(
                        `REEL STORYBOARD — ${reelData.reel_title}\nAudio: ${reelData.audio_direction}\n\n`+
                        frames.map(f=>`[${String(f.number).padStart(2,"0")}] ${f.timecode} · ${f.shot_type} · ${f.movement}\n${f.subject} — ${f.composition}${f.screen_text?`\nTEXT: "${f.screen_text}"`:""}${f.vo?`\nVO: ${f.vo}`:""}`).join("\n\n"),
                        "brief"
                      )}>
                      {copied==="brief"?"COPIED ✓":"COPY FULL BRIEF"}
                    </button>
                  </div>
                </>
              )}

              {tab==="story" && !loading && storyData && (
                <>
                  <div style={{ maxWidth:280, width:"100%", margin:"0 auto" }}>
                    <div className="slide-nav">
                      <button className="nav-btn" disabled={activeStory===0} onClick={() => setActiveStory(i=>i-1)}>← PREV</button>
                      <span style={{ fontFamily:"var(--fm)", fontSize:9, color:"var(--t3)" }}>{activeStory+1} / {storySlides.length}</span>
                      <button className="nav-btn" disabled={activeStory===storySlides.length-1} onClick={() => setActiveStory(i=>i+1)}>NEXT →</button>
                    </div>
                    <StoryPreview slide={storySlides[activeStory]} number={activeStory+1} total={storySlides.length} />
                    <div className="dots">
                      {storySlides.map((_,i) => <div key={i} className={`dot ${i===activeStory?"on":""}`} onClick={() => setActiveStory(i)} />)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontFamily:"var(--fd)", fontSize:17, fontWeight:700, textTransform:"uppercase", color:"var(--t2)", marginBottom:20 }}>
                      {storyData.story_concept}
                    </div>
                    <div className="hr" />
                    <div className="sec-label"><span>S L I D E S   ({storySlides.length})  ·  9 : 1 6</span></div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
                      {storySlides.map((s,i) => (
                        <div key={i} style={{ background:"var(--bg2)", border:"1px solid var(--bdr)",
                          borderLeft: i===activeStory ? "2px solid var(--acc)" : "2px solid transparent",
                          padding:"8px 12px", cursor:"pointer" }}
                          onClick={() => setActiveStory(i)}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                            <span style={{ fontFamily:"var(--fm)", fontSize:8, color:"var(--acc)", letterSpacing:".1em" }}>
                              {String(i+1).padStart(2,"0")}  ·  {s.layout.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontFamily:"var(--fd)", fontSize:12, fontWeight:700, textTransform:"uppercase", color:"var(--t1)", lineHeight:1.2 }}>
                            {s.headline}
                          </div>
                          {s.body && <div style={{ fontFamily:"var(--ff)", fontSize:9, color:"var(--t3)", marginTop:3, lineHeight:1.4, whiteSpace:"pre-line" }}>{s.body}</div>}
                        </div>
                      ))}
                    </div>
                    <div className="acts">
                      <button className="abtn pri" onClick={exportStories} disabled={exporting} style={{ opacity: exporting ? 0.6 : 1 }}>
                        {exporting ? "EXPORTING..." : `↓ EXPORT ${storySlides.length} SLIDES`}
                      </button>
                      <button className="abtn" onClick={generateStory}>REGENERATE</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
