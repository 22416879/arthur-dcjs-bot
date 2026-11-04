import {Events} from "discord.js"

export const event = {
    name:Events.ClientReady,}

export const action = async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
}