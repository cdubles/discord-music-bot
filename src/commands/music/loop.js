import { SlashCommandBuilder } from 'discord.js';

import { LOOP_CYCLE, LoopMode } from '../../constants.js';
import * as embeds from '../../ui/embeds.js';

export default {
  name: 'loop',
  aliases: ['repeat', 'l'],
  description: 'Set the loop mode',
  category: 'Music',
  surfaces: ['slash', 'prefix'],
  guards: ['inGuild', 'inVoice', 'sameVoice', 'hasPlayer', 'dj'],

  args: [
    {
      name: 'mode',
      type: 'choice',
      required: false,
      choices: [LoopMode.OFF, LoopMode.TRACK, LoopMode.QUEUE],
      description: 'off, track or queue',
    },
  ],

  slash: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Omit to cycle through the modes')
        .addChoices(
          { name: 'Off', value: LoopMode.OFF },
          { name: 'Track', value: LoopMode.TRACK },
          { name: 'Queue', value: LoopMode.QUEUE },
        ),
    ),

  async execute(ctx) {
    const queue = ctx.player.queue;
    const requested = ctx.get('mode');

    // No argument cycles off -> track -> queue -> off.
    const mode =
      requested ?? LOOP_CYCLE[(LOOP_CYCLE.indexOf(queue.loopMode) + 1) % LOOP_CYCLE.length];

    queue.loopMode = mode;

    const description = {
      [LoopMode.OFF]: 'Looping is **off**.',
      [LoopMode.TRACK]: 'Now looping the **current track**.',
      [LoopMode.QUEUE]: 'Now looping the **whole queue**.',
    }[mode];

    return ctx.reply(embeds.success(description));
  },
};
