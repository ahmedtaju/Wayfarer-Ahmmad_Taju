import { PlaceDetailView } from "../../../components/place-detail";

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlaceDetailView placeId={id} />;
}
