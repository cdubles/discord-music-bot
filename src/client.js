import { Client, Collection, GatewayIntentBits, Options, Partials } from 'discord.js';

export function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      // Privileged: must be enabled under Bot -> Privileged Gateway Intents.
      // Without it, prefix commands see empty message content.
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
    // A music bot never needs message/reaction history in memory.
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 25,
      ReactionManager: 0,
      GuildMemberManager: {
        maxSize: 200,
        keepOverLimit: (member) => member.id === member.client.user.id,
      },
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 300, lifetime: 900 },
    },
  });

  /** name -> command module */
  client.commands = new Collection();
  /** alias -> canonical name */
  client.aliases = new Collection();
  /** guildId -> MusicPlayer, attached in index.js */
  client.players = null;

  return client;
}

export default createClient;
