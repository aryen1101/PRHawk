import { MongoClient } from "mongodb";
import {config} from "../config.js"
export const client = new MongoClient(config.mongoUri);
