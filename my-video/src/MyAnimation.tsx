import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";
import { z } from "zod";

// A schema lets Remotion Studio give you editable controls for these props,
// and lets you override them per-render from the CLI / API.
export const myAnimationSchema = z.object({
  brand: z.string(),
  tagline: z.string(),
  accent: z.string(),
  features: z.array(z.string()),
});

export const MyAnimation: React.FC<z.infer<typeof myAnimationSchema>> = ({
  brand,
  tagline,
  accent,
  features,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // --- Background: a slow gradient drift driven directly by the frame number.
  // interpolate maps an input range -> output range. extrapolate "clamp" keeps
  // values from shooting past the ends.
  const hue = interpolate(frame, [0, durationInFrames], [210, 260]);

  // --- Title: a spring gives natural, slightly-overshooting motion.
  // spring() returns ~0 -> ~1 over time; we reuse it for scale and opacity.
  const titleIn = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const titleScale = interpolate(titleIn, [0, 1], [0.7, 1]);

  // --- Tagline: fade + rise in, starting a few frames after the title.
  const taglineOpacity = interpolate(frame, [18, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [18, 34], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // --- Outro: gently fade the whole scene at the very end.
  const outro = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 18%), hsl(${hue + 30} 60% 28%))`,
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        opacity: outro,
      }}
    >
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: 120,
        }}
      >
        {/* Brand title */}
        <div
          style={{
            transform: `scale(${titleScale})`,
            opacity: titleIn,
            color: "white",
            fontSize: 130,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          {brand}
        </div>

        {/* Accent underline that wipes out from the center */}
        <div
          style={{
            marginTop: 28,
            height: 8,
            borderRadius: 8,
            background: accent,
            width: interpolate(titleIn, [0, 1], [0, 360]),
          }}
        />

        {/* Tagline */}
        <div
          style={{
            marginTop: 40,
            transform: `translateY(${taglineY}px)`,
            opacity: taglineOpacity,
            color: "rgba(255,255,255,0.85)",
            fontSize: 46,
            fontWeight: 400,
          }}
        >
          {tagline}
        </div>

        {/* Feature chips — each one is a <Sequence> so it has its own local
            timeline, staggered 10 frames apart. Inside, a spring animates it in. */}
        <div
          style={{
            marginTop: 70,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {features.map((label, i) => (
            <Sequence key={label} from={45 + i * 10} name={`Feature ${i + 1}`}>
              <FeatureChip label={label} accent={accent} />
            </Sequence>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// A small child component. Because it lives inside a <Sequence>, useCurrentFrame()
// here is RELATIVE to that sequence's start — so every chip animates from frame 0
// of its own timeline, which is what produces the staggered cascade.
const FeatureChip: React.FC<{ label: string; accent: string }> = ({
  label,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18 } });

  return (
    <div
      style={{
        transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
        opacity: enter,
        padding: "18px 34px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.10)",
        border: `2px solid ${accent}`,
        color: "white",
        fontSize: 34,
        fontWeight: 600,
        backdropFilter: "blur(4px)",
      }}
    >
      {label}
    </div>
  );
};
