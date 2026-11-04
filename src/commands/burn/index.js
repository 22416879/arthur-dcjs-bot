import {SlashCommandBuilder} from 'discord.js';

export const command = new SlashCommandBuilder()
    .setName('burn')
    .setDescription('燃烧卡牌');

export const action = async (interaction) => {
    await interaction.reply('燃烧！');
}