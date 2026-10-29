import { CircleMarker, MapContainer, Popup, TileLayer, ZoomControl } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

/** Centre of Mumbai (Fort / Churchgate area). */
const MUMBAI_CENTER: LatLngExpression = [19.076, 72.8777];
const MUMBAI_ZOOM = 11;

type Landmark = {
  name: string;
  position: LatLngExpression;
};

const LANDMARKS: Landmark[] = [
  { name: "Gateway of India", position: [18.922, 72.8347] },
  { name: "Marine Drive", position: [18.9438, 72.8231] },
  { name: "Bandra–Worli Sea Link", position: [19.0285, 72.8215] },
  { name: "Chhatrapati Shivaji Maharaj Terminus", position: [18.9398, 72.8355] },
];

export default function MumbaiMap() {
  return (
    <MapContainer
      center={MUMBAI_CENTER}
      zoom={MUMBAI_ZOOM}
      minZoom={3}
      maxZoom={19}
      zoomControl={false}
      scrollWheelZoom
      className="map"
    >
      {/* Public OSM tiles: fine for dev and light traffic. For production scale,
          switch to a dedicated tile provider (see OSM tile usage policy). */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      <ZoomControl position="bottomright" />

      {LANDMARKS.map((landmark) => (
        <CircleMarker
          key={landmark.name}
          center={landmark.position}
          radius={8}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#e11d48",
            fillOpacity: 1,
          }}
        >
          <Popup>{landmark.name}</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
