import {SlashCommandBuilder} from 'discord.js';

export const command = new SlashCommandBuilder()
    .setName('view')
    .setDescription('查看卡牌');

export const action = async (interaction) => {
    await interaction.reply('正在查看卡牌');
}