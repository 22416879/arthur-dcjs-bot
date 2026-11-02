import {slashCommandBuilder} from 'discord.js';

export const command = slashCommandBuilder()
    .setName('drop')
    .setDescription('掉卡');

export const action = async (interaction) => {
    await interaction.reply('pong !');
}