import { motion } from "framer-motion";
import type { MessageParticle as ParticleType } from "../../types";
import { PARTICLE_DURATION_S } from "../../lib/constants";
import { getPathEndpoints } from "./graph-layout";

interface MessageParticleProps {
  readonly particle: ParticleType;
  readonly onClick: (particle: ParticleType) => void;
}

export function MessageParticle({ particle, onClick }: MessageParticleProps) {
  const { x1, y1, x2, y2 } = getPathEndpoints(particle.from, particle.to);

  return (
    <motion.circle
      cx={x1}
      cy={y1}
      r={5}
      fill={particle.color}
      opacity={0.9}
      className="cursor-pointer"
      filter="url(#particle-glow)"
      onClick={() => onClick(particle)}
      initial={{ cx: x1, cy: y1, opacity: 0.9, r: 5 }}
      animate={{ cx: x2, cy: y2, opacity: 0, r: 3 }}
      transition={{
        duration: PARTICLE_DURATION_S,
        ease: "easeInOut",
      }}
    />
  );
}
