import { AspectRatio, Text } from "@mattbutlerengineering/rialto";
import type { ShippedVideo as ShippedVideoData } from "../data/shipped-videos.js";
import styles from "./ShippedVideo.module.css";

/** A promo/demo video with its transcript. Never autoplays (motion policy). */
export function ShippedVideo({ video }: { readonly video: ShippedVideoData }) {
  return (
    <figure className={styles.figure}>
      <AspectRatio ratio={16 / 9}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- narration is published as the transcript below; no .vtt is produced by launch-demo */}
        <video
          className={styles.video}
          src={video.src}
          controls
          preload="metadata"
          playsInline
          aria-label={video.title}
        />
      </AspectRatio>
      <details className={styles.transcript}>
        <summary className={styles.summary}>Transcript</summary>
        <Text>{video.transcript}</Text>
      </details>
    </figure>
  );
}
