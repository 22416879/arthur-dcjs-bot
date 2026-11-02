
import { Client, Events, GatewayIntentBits } from 'discord.js';
import vueinit from '@/core/vue.js';
import dotenv from 'dotenv';

vueinit();
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.login(process.env.token);