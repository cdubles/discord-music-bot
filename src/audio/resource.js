import { createAudioResource, StreamType } from '@discordjs/voice';

/**
 * Wrap an ffmpeg PCM stream as a playable resource.
 *
 * StreamType.Raw + inlineVolume gives the pipeline
 *   raw PCM -> VolumeTransformer -> Opus encoder
 * which is what makes live volume changes possible. Passing OggOpus straight
 * through would skip the encode but also skip the volume transformer.
 */
export function buildResource(pcmStream, { volume = 50, metadata = null } = {}) {
  const resource = createAudioResource(pcmStream, {
    inputType: StreamType.Raw,
    inlineVolume: true,
    metadata,
  });

  if (resource.volume) {
    resource.volume.setVolumeLogarithmic(volume / 100);
  }

  return resource;
}

export default buildResource;
