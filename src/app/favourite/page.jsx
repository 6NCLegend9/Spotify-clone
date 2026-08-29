import { redirect } from "next/navigation";

export default function FavouritePage() {
  redirect("/library/liked");
}
