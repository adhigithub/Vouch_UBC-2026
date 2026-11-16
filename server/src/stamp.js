// Saving a rating that passed every check ("stamping" it).
//
// Today ratings are saved in SQLite. When the Solana program is ready, this is
// the one place that changes: submit `submit_rating` with the server's key
// (the program only accepts ratings from that key, and marks the payment used).
import { insertRating } from "./db.js";

export async function stampRating(db, rating) {
  insertRating(db, rating);
  // TODO(solana program): also submit on-chain, e.g. await program.submitRating(rating)
}
