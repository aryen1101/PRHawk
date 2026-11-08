import {Octokit} from "@octokit/rest"
import { config } from "../config.js"

let octokit : Octokit | null = null

export function getOctokitClient(customToken?: string, anonymous = false) : Octokit {
    if (customToken) {
        return new Octokit({auth : customToken});
    }
    if (anonymous) {
        return new Octokit();
    }
    if(!octokit){
        octokit = new Octokit({auth : config.githubToken()})
    }
    return octokit
}
