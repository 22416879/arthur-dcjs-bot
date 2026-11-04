import {SlashCommandBuilder} from 'discord.js';

export const command = new SlashCommandBuilder()
    .setName('trade')
    .setDescription('交換卡牌');

export const action = async (interaction) => {
    await interaction.reply('正在進行交易');
}