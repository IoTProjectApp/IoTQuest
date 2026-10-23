// Expandable Asset Library and Procedural 3D Builders for the World Builder workspace.
// Covers Ready-made buildings, Modular construction parts, Furniture & decor, Infrastructure,
// Nature & vegetation, and IoT components. Free of DOM so it runs under Node.
import { components } from '../../../public/missions.js';
import { addDeviceDetails } from '../../../public/device-objects.js';
import { buildTree, buildCrop } from '../../../public/vegetation.js';

export const ARCHITECTURAL_STYLES = {
  contemporary: {
    id: 'contemporary',
    name: 'Contemporary',
    wall: '#d8dcd6',
    trim: '#4f5d63',
    roof: '#5a666b',
    floor: '#b9b2a2',
    timber: '#b39169',
    glass: '#7fa7b2',
  },
  traditional: {
    id: 'traditional',
    name: 'Traditional Brick & Timber',
    wall: '#c79377',
    trim: '#eee7da',
    roof: '#7a4b3a',
    floor: '#c4ab89',
    timber: '#8f6b4a',
    glass: '#89adb5',
  },
  kyoto: {
    id: 'kyoto',
    name: 'East Asian Timber & Tile',
    wall: '#e2dac8',
    trim: '#524438',
    roof: '#494e54',
    floor: '#c9bc9c',
    timber: '#735840',
    glass: '#8da9ad',
  },
  mediterranean: {
    id: 'mediterranean',
    name: 'Mediterranean / Courtyard',
    wall: '#e6ceb0',
    trim: '#a67653',
    roof: '#b86843',
    floor: '#d1b38e',
    timber: '#99714d',
    glass: '#79a1ab',
  },
  nordic: {
    id: 'nordic',
    name: 'Nordic Timber',
    wall: '#a84a41',
    trim: '#f0ece1',
    roof: '#3a4042',
    floor: '#ccb692',
    timber: '#b8966c',
    glass: '#88b0bd',
  },
};

export const ARCH_STYLES = ARCHITECTURAL_STYLES;

export const ASSET_CATEGORIES = [
  { id: 'buildings', name: 'Buildings' },
  { id: 'modular', name: 'Modular Parts' },
  { id: 'furniture', name: 'Furniture' },
  { id: 'infrastructure', name: 'Roads & Traffic' },
  { id: 'nature', name: 'Nature' },
  { id: 'iot', name: 'IoT Devices' },
];

export const MATERIAL_PRESETS = {
  plaster: { name: 'Plaster', color: '#dcd9ce', roughness: 0.85 },
  brick: { name: 'Brickwork', color: '#b8765c', roughness: 0.9 },
  timber: { name: 'Timber', color: '#a8845e', roughness: 0.78 },
  concrete: { name: 'Concrete', color: '#a5aba6', roughness: 0.92 },
  steel: { name: 'Brushed Steel', color: '#98a6a4', roughness: 0.3 },
  glass: { name: 'Tinted Glass', color: '#7ea5b0', roughness: 0.15, opacity: 0.72 },
  tile: { name: 'Ceramic Tile', color: '#d7dbd4', roughness: 0.38 },
  terracotta: { name: 'Terracotta', color: '#b56545', roughness: 0.82 },
  stone: { name: 'Natural Stone', color: '#8f948e', roughness: 0.94 },
};

// Core expandable asset registry. New content packs can be registered with registerAssetPack().
export const ASSET_LIBRARY = [
  // ---- 1. Ready-Made Buildings ----
  {
    id: 'building/house',
    name: 'Family House',
    category: 'buildings',
    subcategory: 'Residential',
    size: [10, 3.2, 8],
    tags: ['home', 'residential', 'house', 'rooms'],
    defaultProps: {
      style: 'contemporary',
      stories: 1,
      storyHeight: 2.8,
      roofStyle: 'pitched',
      doorOpen: false,
    },
  },
  {
    id: 'building/apartment',
    name: 'Apartment Block',
    category: 'buildings',
    subcategory: 'Residential',
    size: [14, 9, 10],
    tags: ['residential', 'apartments', 'multi-storey', 'flats'],
    defaultProps: {
      style: 'contemporary',
      stories: 3,
      storyHeight: 2.8,
      roofStyle: 'flat',
      doorOpen: false,
    },
  },
  {
    id: 'building/shop',
    name: 'Corner Shop & Café',
    category: 'buildings',
    subcategory: 'Commercial',
    size: [10, 3.6, 8],
    tags: ['store', 'retail', 'cafe', 'market', 'shop'],
    defaultProps: {
      style: 'traditional',
      stories: 1,
      storyHeight: 3.4,
      roofStyle: 'flat',
      doorOpen: true,
    },
  },
  {
    id: 'building/office',
    name: 'Tech Office Hub',
    category: 'buildings',
    subcategory: 'Commercial',
    size: [12, 6.4, 10],
    tags: ['workplace', 'office', 'business', 'commercial'],
    defaultProps: {
      style: 'contemporary',
      stories: 2,
      storyHeight: 3.1,
      roofStyle: 'flat',
      doorOpen: false,
    },
  },
  {
    id: 'building/school',
    name: 'Community School',
    category: 'buildings',
    subcategory: 'Civic',
    size: [16, 3.8, 10],
    tags: ['classroom', 'education', 'school', 'civic'],
    defaultProps: {
      style: 'traditional',
      stories: 1,
      storyHeight: 3.4,
      roofStyle: 'pitched',
      doorOpen: true,
    },
  },
  {
    id: 'building/warehouse',
    name: 'Logistics Warehouse',
    category: 'buildings',
    subcategory: 'Industrial',
    size: [16, 5, 12],
    tags: ['storage', 'industrial', 'depot', 'warehouse'],
    defaultProps: {
      style: 'contemporary',
      stories: 1,
      storyHeight: 4.6,
      roofStyle: 'gable',
      doorOpen: true,
    },
  },
  {
    id: 'building/factory',
    name: 'Automated Factory',
    category: 'buildings',
    subcategory: 'Industrial',
    size: [18, 5.4, 12],
    tags: ['manufacturing', 'plant', 'industrial', 'factory'],
    defaultProps: {
      style: 'contemporary',
      stories: 1,
      storyHeight: 4.8,
      roofStyle: 'pitched',
      doorOpen: true,
    },
  },
  {
    id: 'building/garage',
    name: 'Detached Garage',
    category: 'buildings',
    subcategory: 'Outbuildings',
    size: [6, 2.8, 7],
    tags: ['car', 'parking', 'workshop', 'garage'],
    defaultProps: {
      style: 'contemporary',
      stories: 1,
      storyHeight: 2.6,
      roofStyle: 'pitched',
      doorOpen: false,
    },
  },
  {
    id: 'building/shed',
    name: 'Garden Tool Shed',
    category: 'buildings',
    subcategory: 'Outbuildings',
    size: [3.6, 2.4, 3.2],
    tags: ['storage', 'garden', 'timber', 'shed'],
    defaultProps: {
      style: 'nordic',
      stories: 1,
      storyHeight: 2.2,
      roofStyle: 'pitched',
      doorOpen: false,
    },
  },
  {
    id: 'building/greenhouse',
    name: 'Glass Greenhouse',
    category: 'buildings',
    subcategory: 'Agricultural',
    size: [6, 2.8, 8],
    tags: ['plants', 'crops', 'glass', 'greenhouse', 'garden'],
    defaultProps: {
      style: 'contemporary',
      stories: 1,
      storyHeight: 2.4,
      roofStyle: 'pitched',
      doorOpen: true,
    },
  },
  {
    id: 'building/barn',
    name: 'Farm Barn & Silo',
    category: 'buildings',
    subcategory: 'Agricultural',
    size: [12, 4.8, 10],
    tags: ['farm', 'livestock', 'agriculture', 'barn', 'silo'],
    defaultProps: {
      style: 'nordic',
      stories: 1,
      storyHeight: 4.0,
      roofStyle: 'pitched',
      doorOpen: true,
    },
  },

  // ---- 2. Modular Construction Parts ----
  {
    id: 'modular/foundation',
    name: 'Foundation Slab',
    category: 'modular',
    subcategory: 'Structure',
    size: [4, 0.3, 4],
    tags: ['base', 'concrete', 'floor', 'foundation'],
    defaultProps: { material: 'concrete', color: '#a5aba6' },
  },
  {
    id: 'modular/floor',
    name: 'Floor Tile',
    category: 'modular',
    subcategory: 'Structure',
    size: [4, 0.12, 4],
    tags: ['floor', 'tile', 'wood', 'slab'],
    defaultProps: { material: 'timber', color: '#c4ab89', story: 0 },
  },
  {
    id: 'modular/ceiling',
    name: 'Ceiling Panel',
    category: 'modular',
    subcategory: 'Structure',
    size: [4, 0.12, 4],
    tags: ['ceiling', 'roof', 'top'],
    defaultProps: { material: 'plaster', color: '#ebe8df', story: 0, isRoof: true },
  },
  {
    id: 'modular/wall-straight',
    name: 'Straight Wall (4 m)',
    category: 'modular',
    subcategory: 'Walls',
    size: [4, 2.8, 0.22],
    tags: ['wall', 'exterior', 'interior'],
    defaultProps: { material: 'plaster', color: '#dcd9ce', opening: 'none', story: 0 },
  },
  {
    id: 'modular/wall-corner',
    name: 'Corner Wall Section',
    category: 'modular',
    subcategory: 'Walls',
    size: [2, 2.8, 2],
    tags: ['corner', 'wall', 'angle'],
    defaultProps: { material: 'plaster', color: '#dcd9ce', story: 0 },
  },
  {
    id: 'modular/wall-curved',
    name: 'Curved Wall Arc',
    category: 'modular',
    subcategory: 'Walls',
    size: [3, 2.8, 3],
    tags: ['curved', 'arc', 'wall'],
    defaultProps: { material: 'plaster', color: '#dcd9ce', story: 0 },
  },
  {
    id: 'modular/partition',
    name: 'Interior Partition',
    category: 'modular',
    subcategory: 'Walls',
    size: [3, 2.4, 0.14],
    tags: ['divider', 'room', 'partition', 'wall'],
    defaultProps: { material: 'timber', color: '#cbb08a', story: 0 },
  },
  {
    id: 'modular/wall-door',
    name: 'Wall with Doorway',
    category: 'modular',
    subcategory: 'Openings',
    size: [4, 2.8, 0.22],
    tags: ['door', 'entrance', 'wall', 'opening'],
    defaultProps: {
      material: 'plaster',
      color: '#dcd9ce',
      doorOpen: false,
      hinge: 'left',
      behavior: 'manual',
      story: 0,
    },
  },
  {
    id: 'modular/wall-window',
    name: 'Wall with Window',
    category: 'modular',
    subcategory: 'Openings',
    size: [4, 2.8, 0.22],
    tags: ['window', 'glass', 'wall', 'opening'],
    defaultProps: {
      material: 'plaster',
      color: '#dcd9ce',
      windowWidth: 1.8,
      windowHeight: 1.3,
      story: 0,
    },
  },
  {
    id: 'modular/door',
    name: 'Hinged Door & Frame',
    category: 'modular',
    subcategory: 'Openings',
    size: [1.1, 2.2, 0.24],
    tags: ['door', 'hinge', 'entry'],
    defaultProps: {
      doorOpen: false,
      openAngle: 85,
      hinge: 'left',
      behavior: 'interactive',
      color: '#8f6b4a',
    },
  },
  {
    id: 'modular/window',
    name: 'Framed Casement Window',
    category: 'modular',
    subcategory: 'Openings',
    size: [1.6, 1.3, 0.24],
    tags: ['window', 'glass', 'frame'],
    defaultProps: { color: '#526368' },
  },
  {
    id: 'modular/gate',
    name: 'Swinging Yard Gate',
    category: 'modular',
    subcategory: 'Fencing',
    size: [2.4, 1.3, 0.16],
    tags: ['gate', 'fence', 'entry', 'servo'],
    defaultProps: {
      doorOpen: false,
      openAngle: 90,
      hinge: 'left',
      behavior: 'servo',
      color: '#8c6f52',
    },
  },
  {
    id: 'modular/fence',
    name: 'Timber Fence Section',
    category: 'modular',
    subcategory: 'Fencing',
    size: [3, 1.2, 0.14],
    tags: ['fence', 'boundary', 'garden'],
    defaultProps: { material: 'timber', color: '#a88967' },
  },
  {
    id: 'modular/railing',
    name: 'Safety Balustrade Railing',
    category: 'modular',
    subcategory: 'Fencing',
    size: [3, 1.05, 0.1],
    tags: ['railing', 'balcony', 'guardrail'],
    defaultProps: { material: 'steel', color: '#6b7c80' },
  },
  {
    id: 'modular/stairs',
    name: 'Staircase Flight',
    category: 'modular',
    subcategory: 'Access',
    size: [1.4, 2.8, 3.6],
    tags: ['stairs', 'steps', 'upper floor'],
    defaultProps: { material: 'timber', color: '#ab8965' },
  },
  {
    id: 'modular/ramp',
    name: 'Accessible Ramp',
    category: 'modular',
    subcategory: 'Access',
    size: [1.8, 0.9, 4.2],
    tags: ['ramp', 'slope', 'wheelchair', 'access'],
    defaultProps: { material: 'concrete', color: '#b4b8b2' },
  },
  {
    id: 'modular/balcony',
    name: 'Cantilever Balcony',
    category: 'modular',
    subcategory: 'Access',
    size: [4, 1.2, 2],
    tags: ['balcony', 'terrace', 'deck'],
    defaultProps: { material: 'concrete', color: '#b8bdb6', story: 1 },
  },
  {
    id: 'modular/pillar',
    name: 'Structural Support Pillar',
    category: 'modular',
    subcategory: 'Structure',
    size: [0.35, 2.8, 0.35],
    tags: ['column', 'pillar', 'post'],
    defaultProps: { material: 'concrete', color: '#c4c7c0' },
  },
  {
    id: 'modular/beam',
    name: 'Horizontal Roof Beam',
    category: 'modular',
    subcategory: 'Structure',
    size: [4, 0.28, 0.28],
    tags: ['beam', 'rafter', 'lintel'],
    defaultProps: { material: 'timber', color: '#7d5d3f' },
  },
  {
    id: 'modular/roof-pitched',
    name: 'Pitched Gable Roof',
    category: 'modular',
    subcategory: 'Roofs',
    size: [4.4, 1.5, 4.4],
    tags: ['roof', 'pitched', 'gable', 'tiles'],
    defaultProps: { material: 'terracotta', color: '#9c5a44', roofStyle: 'pitched', isRoof: true },
  },
  {
    id: 'modular/roof-flat',
    name: 'Flat Parapet Roof',
    category: 'modular',
    subcategory: 'Roofs',
    size: [4.2, 0.4, 4.2],
    tags: ['roof', 'flat', 'parapet'],
    defaultProps: { material: 'concrete', color: '#727d80', roofStyle: 'flat', isRoof: true },
  },

  // ---- 3. Furniture & Decor ----
  // Home
  {
    id: 'furniture/table',
    name: 'Dining Table',
    category: 'furniture',
    subcategory: 'Home',
    size: [1.6, 0.8, 1.0],
    tags: ['table', 'dining', 'wood', 'home'],
  },
  {
    id: 'furniture/chair',
    name: 'Dining Chair',
    category: 'furniture',
    subcategory: 'Home',
    size: [0.55, 0.9, 0.55],
    tags: ['chair', 'seat', 'home'],
  },
  {
    id: 'furniture/bed',
    name: 'Double Bed',
    category: 'furniture',
    subcategory: 'Home',
    size: [2.0, 0.95, 2.2],
    tags: ['bed', 'bedroom', 'sleep'],
  },
  {
    id: 'furniture/sofa',
    name: 'Three-Seater Sofa',
    category: 'furniture',
    subcategory: 'Home',
    size: [2.3, 0.9, 0.95],
    tags: ['couch', 'sofa', 'living room', 'lounge'],
  },
  {
    id: 'furniture/cupboard',
    name: 'Storage Cupboard',
    category: 'furniture',
    subcategory: 'Home',
    size: [1.1, 1.8, 0.6],
    tags: ['cabinet', 'wardrobe', 'cupboard'],
  },
  {
    id: 'furniture/shelf',
    name: 'Bookshelf Unit',
    category: 'furniture',
    subcategory: 'Home',
    size: [1.2, 1.75, 0.42],
    tags: ['bookshelf', 'shelving', 'rack'],
  },
  {
    id: 'furniture/counter',
    name: 'Kitchen Island Counter',
    category: 'furniture',
    subcategory: 'Kitchen & Bath',
    size: [2.2, 0.92, 0.8],
    tags: ['kitchen', 'counter', 'bench'],
  },
  {
    id: 'furniture/fridge',
    name: 'Refrigerator',
    category: 'furniture',
    subcategory: 'Kitchen & Bath',
    size: [0.8, 1.85, 0.82],
    tags: ['kitchen', 'appliance', 'fridge', 'freezer'],
  },
  {
    id: 'furniture/stove',
    name: 'Oven & Cooktop',
    category: 'furniture',
    subcategory: 'Kitchen & Bath',
    size: [0.8, 0.92, 0.75],
    tags: ['kitchen', 'appliance', 'oven', 'stove'],
  },
  {
    id: 'furniture/bathtub',
    name: 'Bathtub & Basin',
    category: 'furniture',
    subcategory: 'Kitchen & Bath',
    size: [1.75, 0.68, 0.85],
    tags: ['bathroom', 'bath', 'tub', 'fixture'],
  },
  {
    id: 'furniture/floor-lamp',
    name: 'Standing Floor Lamp',
    category: 'furniture',
    subcategory: 'Lighting',
    size: [0.48, 1.65, 0.48],
    tags: ['lamp', 'light', 'interior'],
  },
  // Commercial / Shop
  {
    id: 'furniture/shop-display',
    name: 'Retail Display Gondola',
    category: 'furniture',
    subcategory: 'Shop & Office',
    size: [1.8, 1.5, 0.75],
    tags: ['shop', 'display', 'retail', 'shelves'],
  },
  {
    id: 'furniture/checkout-counter',
    name: 'Checkout Point-of-Sale',
    category: 'furniture',
    subcategory: 'Shop & Office',
    size: [2.0, 0.98, 0.85],
    tags: ['shop', 'checkout', 'register', 'counter'],
  },
  {
    id: 'furniture/shop-sign',
    name: 'Illuminated Shop Signboard',
    category: 'furniture',
    subcategory: 'Shop & Office',
    size: [2.4, 0.7, 0.18],
    tags: ['sign', 'banner', 'shop'],
  },
  {
    id: 'furniture/storage-rack',
    name: 'Heavy Warehouse Rack',
    category: 'furniture',
    subcategory: 'Industrial',
    size: [2.4, 2.2, 0.9],
    tags: ['rack', 'pallet', 'warehouse', 'storage'],
  },
  // Industrial / Workplace
  {
    id: 'furniture/workbench',
    name: 'Technician Workbench',
    category: 'furniture',
    subcategory: 'Industrial',
    size: [1.9, 1.15, 0.8],
    tags: ['workbench', 'tools', 'garage', 'factory'],
  },
  {
    id: 'furniture/machinery',
    name: 'CNC Assembly Machine',
    category: 'furniture',
    subcategory: 'Industrial',
    size: [2.1, 1.85, 1.4],
    tags: ['machine', 'factory', 'industrial', 'equipment'],
  },
  {
    id: 'furniture/conveyor',
    name: 'Roller Conveyor Belt',
    category: 'furniture',
    subcategory: 'Industrial',
    size: [3.4, 0.88, 0.9],
    tags: ['conveyor', 'belt', 'factory', 'line'],
  },
  {
    id: 'furniture/shipping-container',
    name: 'Storage Cargo Container',
    category: 'furniture',
    subcategory: 'Industrial',
    size: [3.2, 2.4, 2.2],
    tags: ['container', 'cargo', 'storage', 'box'],
  },
  // Outdoor & Civic
  {
    id: 'furniture/streetlight',
    name: 'LED Streetlight Pole',
    category: 'furniture',
    subcategory: 'Outdoor',
    size: [0.9, 4.2, 0.9],
    tags: ['streetlight', 'lamp', 'road', 'light'],
  },
  {
    id: 'furniture/bench',
    name: 'Park Timber Bench',
    category: 'furniture',
    subcategory: 'Outdoor',
    size: [1.8, 0.9, 0.7],
    tags: ['bench', 'seat', 'park', 'outdoor'],
  },
  {
    id: 'furniture/bin',
    name: 'Recycling & Waste Bin',
    category: 'furniture',
    subcategory: 'Outdoor',
    size: [0.55, 0.95, 0.55],
    tags: ['bin', 'trash', 'waste', 'street'],
  },
  {
    id: 'furniture/playground-slide',
    name: 'Playground Slide & Climb',
    category: 'furniture',
    subcategory: 'Outdoor',
    size: [2.8, 2.4, 3.8],
    tags: ['playground', 'slide', 'park', 'children'],
  },
  {
    id: 'furniture/garden-bed',
    name: 'Raised Timber Garden Bed',
    category: 'furniture',
    subcategory: 'Outdoor',
    size: [2.6, 0.85, 1.4],
    tags: ['garden', 'plants', 'soil', 'crops', 'bed'],
  },
  {
    id: 'furniture/water-tank',
    name: 'Rainwater Harvesting Tank',
    category: 'furniture',
    subcategory: 'Outdoor',
    size: [2.1, 2.2, 2.1],
    tags: ['tank', 'water', 'irrigation', 'garden'],
  },

  // ---- 4. Roads, Infrastructure & Vehicles ----
  {
    id: 'infra/traffic-light',
    name: 'Traffic Signal Pole',
    category: 'infrastructure',
    subcategory: 'Signals & Signs',
    size: [0.6, 3.6, 0.6],
    tags: ['traffic', 'signal', 'lights', 'intersection'],
    defaultProps: { phase: 'green' },
  },
  {
    id: 'infra/pedestrian-signal',
    name: 'Pedestrian Crossing Signal',
    category: 'infrastructure',
    subcategory: 'Signals & Signs',
    size: [0.45, 2.6, 0.45],
    tags: ['pedestrian', 'walk', 'crossing', 'signal'],
  },
  {
    id: 'infra/road-sign',
    name: 'Stop / Speed Road Sign',
    category: 'infrastructure',
    subcategory: 'Signals & Signs',
    size: [0.6, 2.3, 0.6],
    tags: ['sign', 'stop', 'road', 'traffic'],
    defaultProps: { signType: 'stop' },
  },
  {
    id: 'infra/bridge',
    name: 'Arch Road Bridge',
    category: 'infrastructure',
    subcategory: 'Structures',
    size: [8, 2.2, 14],
    tags: ['bridge', 'river', 'crossing', 'road'],
  },
  {
    id: 'infra/parking-lot',
    name: 'Marked Parking Area (3 Bays)',
    category: 'infrastructure',
    subcategory: 'Surfaces',
    size: [9, 0.08, 5.5],
    tags: ['parking', 'car', 'bays', 'asphalt'],
  },
  {
    id: 'infra/bus-stop',
    name: 'Bus Shelter & Stop',
    category: 'infrastructure',
    subcategory: 'Structures',
    size: [3.2, 2.4, 1.6],
    tags: ['bus', 'shelter', 'transit'],
  },
  {
    id: 'infra/vehicle-car',
    name: 'Electric Passenger Car',
    category: 'infrastructure',
    subcategory: 'Agents',
    size: [1.7, 1.35, 3.4],
    tags: ['car', 'vehicle', 'traffic', 'simulation'],
    defaultProps: { speed: 6, followRoads: true, color: '#4f8699' },
  },
  {
    id: 'infra/pedestrian',
    name: 'Walking Resident / Pedestrian',
    category: 'infrastructure',
    subcategory: 'Agents',
    size: [0.6, 1.75, 0.6],
    tags: ['person', 'pedestrian', 'resident', 'walker'],
    defaultProps: { speed: 1.4, followPaths: true, color: '#5b8a72' },
  },

  // ---- 5. Nature & Vegetation ----
  {
    id: 'nature/broadleaf',
    name: 'Broadleaf Shade Tree',
    category: 'nature',
    subcategory: 'Trees',
    size: [3.2, 3.6, 3.2],
    tags: ['tree', 'oak', 'broadleaf', 'forest'],
  },
  {
    id: 'nature/conifer',
    name: 'Alpine Conifer / Pine',
    category: 'nature',
    subcategory: 'Trees',
    size: [2.4, 4.0, 2.4],
    tags: ['tree', 'pine', 'conifer', 'spruce'],
  },
  {
    id: 'nature/palm',
    name: 'Coastal Palm Tree',
    category: 'nature',
    subcategory: 'Trees',
    size: [2.8, 3.8, 2.8],
    tags: ['tree', 'palm', 'tropical', 'island'],
  },
  {
    id: 'nature/eucalypt',
    name: 'Eucalyptus Gum Tree',
    category: 'nature',
    subcategory: 'Trees',
    size: [3.0, 3.6, 3.0],
    tags: ['tree', 'eucalyptus', 'gum'],
  },
  {
    id: 'nature/bush',
    name: 'Leafy Garden Shrub',
    category: 'nature',
    subcategory: 'Foliage',
    size: [1.3, 1.0, 1.3],
    tags: ['bush', 'shrub', 'hedge', 'plant'],
  },
  {
    id: 'nature/flower',
    name: 'Wildflower Patch',
    category: 'nature',
    subcategory: 'Foliage',
    size: [0.9, 0.45, 0.9],
    tags: ['flower', 'blossom', 'garden'],
  },
  {
    id: 'nature/grass-tuft',
    name: 'Tall Meadow Grass',
    category: 'nature',
    subcategory: 'Foliage',
    size: [0.7, 0.4, 0.7],
    tags: ['grass', 'meadow', 'reeds'],
  },
  {
    id: 'nature/rock',
    name: 'Granite Boulder',
    category: 'nature',
    subcategory: 'Rocks',
    size: [1.5, 1.1, 1.4],
    tags: ['rock', 'stone', 'boulder'],
  },

  // ---- 6. Microcontrollers & IoT Devices ----
  {
    id: 'iot/board-esp32',
    name: 'ESP32 Controller Station',
    category: 'iot',
    subcategory: 'Controllers',
    size: [0.7, 1.0, 0.5],
    tags: ['controller', 'esp32', 'board', 'arduino', 'micropython'],
    defaultProps: { boardType: 'ESP32' },
  },
  {
    id: 'iot/board-pico',
    name: 'Raspberry Pi Pico Station',
    category: 'iot',
    subcategory: 'Controllers',
    size: [0.7, 1.0, 0.5],
    tags: ['controller', 'pico', 'board', 'micropython', 'arduino'],
    defaultProps: { boardType: 'Raspberry Pi Pico' },
  },
];

// Extend with additional requested IoT sensors & actuators plus all built-in IoTQuest components
const EXTRA_IOT_DEVICES = [
  {
    id: 'smoke',
    name: 'Smoke detector',
    icon: '☁',
    signal: 'dust',
    analog: true,
    desc: 'Photoelectric smoke & particulate detector (0–100).',
  },
  {
    id: 'gas',
    name: 'Gas sensor (MQ-2)',
    icon: '⚗',
    signal: 'dust',
    analog: true,
    desc: 'Combustible gas & vapour concentration sensor (0–100).',
  },
  {
    id: 'keypad',
    name: 'Matrix Keypad (4×4)',
    icon: '⊞',
    signal: 'pressed',
    desc: 'Entry keypad: HIGH when access PIN is entered.',
  },
  {
    id: 'rfid',
    name: 'RFID Card Reader',
    icon: '▣',
    signal: 'docked',
    desc: 'Contactless smart-card reader: HIGH when an authorised tag is scanned.',
  },
  {
    id: 'display',
    name: 'OLED Status Display',
    icon: '▭',
    output: true,
    desc: 'I2C OLED screen that lights up and displays status messages when driven HIGH or via Serial.',
  },
];

const ALL_IOT_COMPONENTS = [...components, ...EXTRA_IOT_DEVICES];
const seenComponentIds = new Set();
for (const comp of ALL_IOT_COMPONENTS) {
  if (seenComponentIds.has(comp.id)) continue;
  seenComponentIds.add(comp.id);
  ASSET_LIBRARY.push({
    id: 'iot/' + comp.id,
    componentId: comp.id,
    name: comp.name,
    category: 'iot',
    subcategory: comp.output ? 'Actuators & Outputs' : 'Sensors & Inputs',
    size: [0.5, 1.15, 0.5],
    tags: [
      comp.id,
      comp.name.toLowerCase(),
      comp.signal || '',
      comp.output ? 'actuator output' : 'sensor input',
    ].filter(Boolean),
    defaultProps: {
      componentId: comp.id,
      signal: comp.signal || null,
      output: !!comp.output,
      analog: !!comp.analog,
      pin: null,
      power: true,
      ground: true,
      resistorConnected: true,
    },
  });
}

export function getComponentSpec(componentId) {
  return ALL_IOT_COMPONENTS.find((c) => c.id === componentId) || null;
}

export function getAssetSpec(kind) {
  return ASSET_LIBRARY.find((a) => a.id === kind) || null;
}

// Allows external content packs to register new assets at runtime.
export function registerAssetPack(packOrItems = [], maybeItems = null) {
  const items = Array.isArray(packOrItems)
    ? packOrItems
    : Array.isArray(maybeItems)
      ? maybeItems
      : [];
  let added = 0;
  for (const item of items) {
    if (item?.id && !ASSET_LIBRARY.some((a) => a.id === item.id)) {
      ASSET_LIBRARY.push(item);
      added++;
    }
  }
  return added;
}

// Builds procedural 3D meshes and colliders for a placed World Builder object.
// Returns { parts, colliders } in world space around obj.pos, rotated by obj.turn and scaled by obj.scale.
export function buildAssetInstance(model, obj, options = {}) {
  const { hideRoofs = false, maxVisibleStory = Infinity, deviceOutputs = {} } = options;
  const parts = [];
  const colliders = [];
  const [ox, oy, oz] = obj.pos || [0, 0, 0];
  const turn = obj.turn || 0;
  const scaleArr = Array.isArray(obj.scale)
    ? obj.scale
    : [obj.scale || 1, obj.scale || 1, obj.scale || 1];
  const [sx, sy, sz] = scaleArr;
  const cos = Math.cos(turn),
    sin = Math.sin(turn);
  const props = { ...(getAssetSpec(obj.kind)?.defaultProps || {}), ...(obj.props || {}) };

  const toWorldPos = (lx, ly, lz) => {
    const rx = lx * sx,
      ry = ly * sy,
      rz = lz * sz;
    return [ox + rx * cos + rz * sin, oy + ry, oz - rx * sin + rz * cos];
  };

  const addPart = (shape, [lx, ly, lz], [w, h, d], color, extra = {}) => {
    if (extra.story !== undefined && extra.story + 1 > maxVisibleStory) return null;
    const isRoof = extra.isRoof || props.isRoof;
    if (isRoof && hideRoofs) return null;
    const opacity = extra.opacity ?? props.opacity ?? 1;
    const rot = [...(extra.rotation || [0, 0, 0])];
    rot[1] = (rot[1] || 0) + turn;
    const m = model.mesh(
      shape,
      toWorldPos(lx, ly, lz),
      [Math.max(0.02, w * sx), Math.max(0.02, h * sy), Math.max(0.02, d * sz)],
      extra.overrideColor || color,
      {
        ...extra,
        opacity,
        rotation: rot,
        wbId: obj.id,
        editGroup: obj.id,
      },
    );
    if (isRoof) model.roofs?.push(m);
    parts.push(m);
    return m;
  };

  const addCollider = (lx, lz, w, d) => {
    const [wx, , wz] = toWorldPos(lx, 0, lz);
    const rw = w * sx,
      rd = d * sz;
    const cw = Math.abs(cos) * rw + Math.abs(sin) * rd;
    const cd = Math.abs(sin) * rw + Math.abs(cos) * rd;
    const c = { x: wx, z: wz, w: cw, d: cd, wbId: obj.id, editGroup: obj.id };
    model.colliders?.push(c);
    colliders.push(c);
  };

  const style = ARCHITECTURAL_STYLES[props.style] || ARCHITECTURAL_STYLES.contemporary;
  const matColor = props.color || MATERIAL_PRESETS[props.material]?.color;
  const kind = obj.kind || 'modular/floor';

  // ---- Custom Footprint Building (drawn by footprint tool) ----
  if (kind === 'building/footprint') {
    const w = props.width || 8,
      d = props.depth || 6,
      stories = Math.max(1, Math.min(5, Number(props.stories) || 1)),
      sh = Number(props.storyHeight) || 2.8,
      wallColor = props.color || style.wall,
      roofColor = props.roofColor || style.roof,
      floorColor = props.floorColor || style.floor,
      roofStyle = props.roofStyle || 'pitched';

    for (let s = 0; s < stories; s++) {
      if (s + 1 > maxVisibleStory) continue;
      const base = s * sh;
      // Floor slab
      addPart('box', [0, base + 0.08, 0], [w, 0.16, d], floorColor, { story: s, rounded: false });
      const t = 0.22;
      // Back wall
      addPart('box', [0, base + sh / 2, -d / 2 + t / 2], [w, sh, t], wallColor, {
        story: s,
        architectureMesh: true,
      });
      // Left & Right walls with windows
      for (const side of [-1, 1]) {
        const wx = (side * (w - t)) / 2;
        addPart('box', [wx, base + sh * 0.2, 0], [t, sh * 0.4, d - t * 2], wallColor, {
          story: s,
          architectureMesh: true,
        });
        addPart('box', [wx, base + sh * 0.85, 0], [t, sh * 0.3, d - t * 2], wallColor, {
          story: s,
          architectureMesh: true,
        });
        addPart('box', [wx, base + sh * 0.52, -d * 0.3], [t, sh * 0.35, d * 0.25], wallColor, {
          story: s,
          architectureMesh: true,
        });
        addPart('box', [wx, base + sh * 0.52, d * 0.3], [t, sh * 0.35, d * 0.25], wallColor, {
          story: s,
          architectureMesh: true,
        });
        addPart('box', [wx, base + sh * 0.52, 0], [0.06, sh * 0.35, d * 0.35], style.glass, {
          story: s,
          opacity: 0.65,
          roughness: 0.15,
        });
      }
      // Front wall with doorway on ground floor
      const fz = d / 2 - t / 2;
      if (s === 0) {
        const doorW = Math.min(1.4, w * 0.3);
        const sideW = (w - doorW) / 2;
        addPart('box', [-w / 2 + sideW / 2, base + sh / 2, fz], [sideW, sh, t], wallColor, {
          story: s,
          architectureMesh: true,
        });
        addPart('box', [w / 2 - sideW / 2, base + sh / 2, fz], [sideW, sh, t], wallColor, {
          story: s,
          architectureMesh: true,
        });
        addPart('box', [0, base + sh - 0.3, fz], [doorW, 0.6, t], wallColor, {
          story: s,
          architectureMesh: true,
        });
        // Door panel
        const open = props.doorOpen ? (props.hinge === 'right' ? -1.3 : 1.3) : 0;
        const hx = props.hinge === 'right' ? doorW / 2 : -doorW / 2;
        const leafX = hx + (props.hinge === 'right' ? -1 : 1) * (doorW / 2) * Math.cos(open);
        const leafZ = fz + (doorW / 2) * Math.sin(open);
        addPart(
          'box',
          [leafX, base + (sh - 0.6) / 2, leafZ],
          [doorW - 0.06, sh - 0.6, 0.08],
          style.timber,
          {
            story: s,
            rotation: [0, open, 0],
          },
        );
      } else {
        addPart('box', [0, base + sh / 2, fz], [w, sh, t], wallColor, {
          story: s,
          architectureMesh: true,
        });
      }
    }
    const topY = stories * sh;
    if (roofStyle === 'pitched' || roofStyle === 'gable') {
      addPart('gable', [0, topY + 0.9, 0], [w + 0.6, 1.8, d + 0.6], roofColor, {
        isRoof: true,
        story: stories - 1,
      });
    } else {
      addPart('box', [0, topY + 0.12, 0], [w + 0.4, 0.24, d + 0.4], roofColor, {
        isRoof: true,
        story: stories - 1,
        rounded: false,
      });
    }
    if (!props.doorOpen) addCollider(0, 0, w, d);
    return { parts, colliders };
  }

  // ---- 1. Ready-Made Buildings ----
  if (kind.startsWith('building/')) {
    const spec = getAssetSpec(kind);
    const [bw, , bd] = spec ? spec.size : [10, 3.2, 8];
    const stories = Math.max(1, Math.min(6, Number(props.stories) || 1));
    const sh = Number(props.storyHeight) || 2.8;
    const wallColor = matColor || style.wall;
    const roofColor = props.roofColor || style.roof;
    const roofStyle = props.roofStyle || 'pitched';

    for (let s = 0; s < stories; s++) {
      if (s + 1 > maxVisibleStory) continue;
      const base = s * sh;
      // Floor
      addPart('box', [0, base + 0.08, 0], [bw, 0.16, bd], style.floor, {
        story: s,
        rounded: false,
      });
      const t = 0.22;
      if (kind === 'building/greenhouse') {
        // Glass walls & frame
        addPart('box', [0, base + sh / 2, 0], [bw, sh, bd], '#8ab4bd', {
          story: s,
          opacity: 0.42,
          roughness: 0.12,
        });
        for (const sxSign of [-1, 1])
          for (const szSign of [-1, 1])
            addPart(
              'box',
              [(sxSign * bw) / 2, base + sh / 2, (szSign * bd) / 2],
              [0.12, sh, 0.12],
              '#4b635e',
              { story: s },
            );
      } else {
        // Back wall
        addPart('box', [0, base + sh / 2, -bd / 2 + t / 2], [bw, sh, t], wallColor, {
          story: s,
          architectureMesh: true,
        });
        // Side walls
        for (const side of [-1, 1]) {
          addPart(
            'box',
            [(side * (bw - t)) / 2, base + sh / 2, 0],
            [t, sh, bd - t * 2],
            wallColor,
            {
              story: s,
              architectureMesh: true,
            },
          );
          // Side window glazing
          addPart(
            'box',
            [(side * bw) / 2, base + sh * 0.55, 0],
            [0.06, sh * 0.4, bd * 0.45],
            style.glass,
            {
              story: s,
              opacity: 0.72,
              roughness: 0.15,
            },
          );
        }
        // Front wall with entrance opening on story 0
        const fz = bd / 2 - t / 2;
        if (s === 0) {
          const openW =
            kind === 'building/garage' || kind === 'building/warehouse'
              ? bw * 0.55
              : Math.min(2.0, bw * 0.3);
          const sideW = (bw - openW) / 2;
          addPart('box', [-bw / 2 + sideW / 2, base + sh / 2, fz], [sideW, sh, t], wallColor, {
            story: s,
            architectureMesh: true,
          });
          addPart('box', [bw / 2 - sideW / 2, base + sh / 2, fz], [sideW, sh, t], wallColor, {
            story: s,
            architectureMesh: true,
          });
          addPart('box', [0, base + sh - 0.35, fz], [openW, 0.7, t], wallColor, {
            story: s,
            architectureMesh: true,
          });
          // Door leaf or roller door
          const isOpen = !!props.doorOpen;
          if (!isOpen) {
            addPart(
              'box',
              [0, base + (sh - 0.7) / 2, fz],
              [openW - 0.08, sh - 0.7, 0.1],
              style.timber,
              {
                story: s,
              },
            );
          } else if (kind === 'building/garage' || kind === 'building/warehouse') {
            addPart('box', [0, base + sh - 0.75, fz - 0.3], [openW - 0.08, 0.25, 0.5], style.trim, {
              story: s,
            });
          } else {
            addPart(
              'box',
              [-openW / 2, base + (sh - 0.7) / 2, fz + openW * 0.45],
              [0.08, sh - 0.7, openW * 0.9],
              style.timber,
              {
                story: s,
              },
            );
          }
        } else {
          addPart('box', [0, base + sh / 2, fz], [bw, sh, t], wallColor, {
            story: s,
            architectureMesh: true,
          });
          addPart('box', [0, base + sh * 0.55, bd / 2], [bw * 0.55, sh * 0.4, 0.06], style.glass, {
            story: s,
            opacity: 0.72,
          });
        }
      }
    }

    // Extra building landmarks (barn silo, factory stacks, shop awning)
    const topY = stories * sh;
    if (kind === 'building/barn') {
      addPart(
        'cylinder',
        [bw / 2 + 1.4, topY * 0.65, -bd * 0.2],
        [2.2, topY * 1.3, 2.2],
        '#b5bfc2',
        {
          roughness: 0.35,
        },
      );
      addPart('sphere', [bw / 2 + 1.4, topY * 1.3, -bd * 0.2], [2.2, 1.4, 2.2], '#98a4a8');
    } else if (kind === 'building/factory') {
      for (const dx of [-bw * 0.28, -bw * 0.12]) {
        addPart('cylinder', [dx, topY + 1.2, -bd * 0.25], [0.9, 2.4, 0.9], '#6e787a');
      }
    } else if (kind === 'building/shop') {
      addPart('box', [0, 2.5, bd / 2 + 0.6], [bw * 0.85, 0.18, 1.2], '#c45b4b', {
        rotation: [0.2, 0, 0],
      });
    }

    // Roof
    if (roofStyle === 'flat') {
      addPart('box', [0, topY + 0.14, 0], [bw + 0.4, 0.28, bd + 0.4], roofColor, {
        isRoof: true,
        story: stories - 1,
        rounded: false,
      });
    } else {
      addPart('gable', [0, topY + 0.85, 0], [bw + 0.6, 1.7, bd + 0.6], roofColor, {
        isRoof: true,
        story: stories - 1,
        opacity: kind === 'building/greenhouse' ? 0.45 : undefined,
      });
    }
    addCollider(0, 0, bw * 0.9, bd * 0.9);
    return { parts, colliders };
  }

  // ---- 2. Modular Construction Parts ----
  if (kind.startsWith('modular/')) {
    const color = matColor || '#dcd9ce';
    const roughness = MATERIAL_PRESETS[props.material]?.roughness ?? 0.82;
    const story = Number(props.story) || 0;

    if (kind === 'modular/foundation') {
      addPart('box', [0, 0.15, 0], [4, 0.3, 4], color, { roughness, story, rounded: false });
    } else if (kind === 'modular/floor') {
      addPart('box', [0, 0.06, 0], [4, 0.12, 4], color, { roughness, story, rounded: false });
    } else if (kind === 'modular/ceiling') {
      addPart('box', [0, 0.06, 0], [4, 0.12, 4], color, {
        roughness,
        story,
        isRoof: true,
        rounded: false,
      });
    } else if (kind === 'modular/wall-straight') {
      addPart('box', [0, 1.4, 0], [4, 2.8, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addCollider(0, 0, 4, 0.24);
    } else if (kind === 'modular/wall-corner') {
      addPart('box', [0, 1.4, -0.89], [2, 2.8, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [-0.89, 1.4, 0.11], [0.22, 2.8, 1.78], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addCollider(0, 0, 2, 2);
    } else if (kind === 'modular/wall-curved') {
      for (let i = 0; i < 6; i++) {
        const a = (i + 0.5) * (Math.PI / 2 / 6);
        const r = 1.4;
        addPart(
          'box',
          [Math.cos(a) * r - 0.7, 1.4, Math.sin(a) * r - 0.7],
          [0.62, 2.8, 0.2],
          color,
          { roughness, story, rotation: [0, -a, 0], architectureMesh: true },
        );
      }
    } else if (kind === 'modular/partition') {
      addPart('box', [0, 1.2, 0], [3, 2.4, 0.14], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addCollider(0, 0, 3, 0.18);
    } else if (kind === 'modular/wall-door') {
      // Two side pillars and lintel around a 1.1m wide x 2.1m high doorway
      addPart('box', [-1.275, 1.4, 0], [1.45, 2.8, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [1.275, 1.4, 0], [1.45, 2.8, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [0, 2.45, 0], [1.1, 0.7, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      // Door leaf
      const openRad = props.doorOpen ? ((Number(props.openAngle) || 85) * Math.PI) / 180 : 0;
      const dir = props.hinge === 'right' ? -1 : 1;
      const hx = props.hinge === 'right' ? 0.52 : -0.52;
      const angle = dir * openRad;
      addPart(
        'box',
        [hx - dir * 0.5 * Math.cos(angle), 1.05, 0.5 * Math.sin(Math.abs(angle))],
        [1.02, 2.08, 0.07],
        '#8f6b4a',
        { story, rotation: [0, angle, 0] },
      );
      if (!props.doorOpen) addCollider(0, 0, 4, 0.24);
    } else if (kind === 'modular/wall-window') {
      const ww = Math.min(3.2, Math.max(0.8, Number(props.windowWidth) || 1.8));
      const wh = Math.min(2.0, Math.max(0.6, Number(props.windowHeight) || 1.3));
      const sideW = (4 - ww) / 2;
      const sillH = 0.85;
      const lintelH = 2.8 - sillH - wh;
      addPart('box', [-2 + sideW / 2, 1.4, 0], [sideW, 2.8, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [2 - sideW / 2, 1.4, 0], [sideW, 2.8, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [0, sillH / 2, 0], [ww, sillH, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [0, 2.8 - lintelH / 2, 0], [ww, lintelH, 0.22], color, {
        roughness,
        story,
        architectureMesh: true,
      });
      addPart('box', [0, sillH + wh / 2, 0], [ww, wh, 0.06], '#7fa7b2', {
        story,
        opacity: 0.65,
        roughness: 0.15,
      });
      addCollider(0, 0, 4, 0.24);
    } else if (kind === 'modular/door') {
      const openRad = props.doorOpen ? ((Number(props.openAngle) || 85) * Math.PI) / 180 : 0;
      const dir = props.hinge === 'right' ? -1 : 1;
      const hx = props.hinge === 'right' ? 0.48 : -0.48;
      const angle = dir * openRad;
      // Frame
      addPart('box', [-0.52, 1.1, 0], [0.08, 2.2, 0.24], '#5c4938', { story });
      addPart('box', [0.52, 1.1, 0], [0.08, 2.2, 0.24], '#5c4938', { story });
      addPart('box', [0, 2.16, 0], [1.12, 0.08, 0.24], '#5c4938', { story });
      // Leaf
      addPart(
        'box',
        [hx - dir * 0.46 * Math.cos(angle), 1.06, 0.46 * Math.sin(Math.abs(angle))],
        [0.94, 2.1, 0.07],
        color,
        { story, rotation: [0, angle, 0] },
      );
      if (!props.doorOpen) addCollider(0, 0, 1.1, 0.24);
    } else if (kind === 'modular/window') {
      addPart('box', [0, 0.65, 0], [1.6, 1.3, 0.06], '#7fa7b2', {
        story,
        opacity: 0.68,
        roughness: 0.15,
      });
      addPart('box', [0, 0.04, 0], [1.68, 0.08, 0.26], color, { story });
      addPart('box', [0, 1.26, 0], [1.68, 0.08, 0.26], color, { story });
      addPart('box', [-0.78, 0.65, 0], [0.08, 1.3, 0.24], color, { story });
      addPart('box', [0.78, 0.65, 0], [0.08, 1.3, 0.24], color, { story });
    } else if (kind === 'modular/gate') {
      const openRad = props.doorOpen ? ((Number(props.openAngle) || 90) * Math.PI) / 180 : 0;
      const dir = props.hinge === 'right' ? -1 : 1;
      const hx = props.hinge === 'right' ? 1.1 : -1.1;
      const angle = dir * openRad;
      addPart('box', [-1.15, 0.65, 0], [0.14, 1.3, 0.14], '#6e5842', { story });
      addPart('box', [1.15, 0.65, 0], [0.14, 1.3, 0.14], '#6e5842', { story });
      addPart(
        'box',
        [hx - dir * 1.05 * Math.cos(angle), 0.62, 1.05 * Math.sin(Math.abs(angle))],
        [2.1, 1.05, 0.08],
        color,
        { story, rotation: [0, angle, 0] },
      );
      if (!props.doorOpen) addCollider(0, 0, 2.4, 0.2);
    } else if (kind === 'modular/fence') {
      for (const dx of [-1.4, 0, 1.4])
        addPart('box', [dx, 0.6, 0], [0.12, 1.2, 0.12], color, { story });
      for (const y of [0.35, 0.75, 1.08])
        addPart('box', [0, y, 0], [3, 0.08, 0.06], color, { story });
      addCollider(0, 0, 3, 0.18);
    } else if (kind === 'modular/railing') {
      for (let dx = -1.4; dx <= 1.41; dx += 0.4)
        addPart('cylinder', [dx, 0.5, 0], [0.04, 1.0, 0.04], color, { story });
      addPart('box', [0, 1.02, 0], [3, 0.06, 0.08], color, { story });
    } else if (kind === 'modular/stairs') {
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        addPart('box', [0, (i + 0.5) * 0.28, -1.6 + i * 0.35], [1.4, 0.12, 0.38], color, { story });
      }
    } else if (kind === 'modular/ramp') {
      addPart('box', [0, 0.45, 0], [1.8, 0.14, 4.3], color, {
        story,
        rotation: [-Math.atan2(0.9, 4.2), 0, 0],
      });
    } else if (kind === 'modular/balcony') {
      addPart('box', [0, 0.08, 0], [4, 0.16, 2], color, { story, rounded: false });
      addPart('box', [0, 0.6, 0.95], [4, 0.95, 0.08], '#6e7e82', { story });
      for (const side of [-1, 1])
        addPart('box', [side * 1.95, 0.6, 0], [0.08, 0.95, 2], '#6e7e82', { story });
    } else if (kind === 'modular/pillar') {
      addPart('cylinder', [0, 1.4, 0], [0.35, 2.8, 0.35], color, { story });
      addCollider(0, 0, 0.35, 0.35);
    } else if (kind === 'modular/beam') {
      addPart('box', [0, 0.14, 0], [4, 0.28, 0.28], color, { story });
    } else if (kind === 'modular/roof-pitched') {
      addPart('gable', [0, 0.75, 0], [4.4, 1.5, 4.4], color, { story, isRoof: true });
    } else if (kind === 'modular/roof-flat') {
      addPart('box', [0, 0.12, 0], [4.2, 0.24, 4.2], color, {
        story,
        isRoof: true,
        rounded: false,
      });
    }
    return { parts, colliders };
  }

  // ---- 3. Furniture & Decor ----
  if (kind.startsWith('furniture/')) {
    const c = matColor || '#b5946d';
    if (kind === 'furniture/table') {
      addPart('box', [0, 0.74, 0], [1.6, 0.08, 1.0], c, { rounded: true });
      for (const dx of [-0.68, 0.68])
        for (const dz of [-0.4, 0.4])
          addPart('cylinder', [dx, 0.36, dz], [0.07, 0.72, 0.07], '#5c4d42');
      addCollider(0, 0, 1.6, 1.0);
    } else if (kind === 'furniture/chair') {
      addPart('box', [0, 0.46, 0], [0.52, 0.07, 0.52], c, { rounded: true });
      addPart('box', [0, 0.72, -0.22], [0.52, 0.46, 0.07], c, { rounded: true });
      for (const dx of [-0.2, 0.2])
        for (const dz of [-0.2, 0.2])
          addPart('cylinder', [dx, 0.22, dz], [0.05, 0.44, 0.05], '#5c4d42');
    } else if (kind === 'furniture/bed') {
      addPart('box', [0, 0.28, 0], [2.0, 0.26, 2.2], '#8e6d4f', { rounded: true });
      addPart('box', [0, 0.48, 0.05], [1.9, 0.22, 2.0], '#f2ece1', { rounded: true });
      addPart('box', [0, 0.58, 0.35], [1.92, 0.1, 1.3], '#6d8c84', { rounded: true });
      addPart('box', [0, 0.68, -1.02], [2.0, 0.65, 0.14], '#7a5d43', { rounded: true });
      addCollider(0, 0, 2.0, 2.2);
    } else if (kind === 'furniture/sofa') {
      addPart('box', [0, 0.28, 0], [2.2, 0.32, 0.9], '#788f87', { rounded: true });
      addPart('box', [0, 0.62, -0.35], [2.2, 0.48, 0.2], '#6b827a', { rounded: true });
      for (const side of [-1, 1])
        addPart('box', [side * 1.02, 0.48, 0], [0.18, 0.36, 0.9], '#6b827a', { rounded: true });
      addCollider(0, 0, 2.2, 0.9);
    } else if (kind === 'furniture/cupboard' || kind === 'furniture/shelf') {
      addPart('box', [0, 0.9, 0], [1.15, 1.8, 0.52], c, { rounded: true });
      addCollider(0, 0, 1.15, 0.52);
    } else if (kind === 'furniture/counter' || kind === 'furniture/checkout-counter') {
      addPart('box', [0, 0.44, 0], [2.1, 0.88, 0.78], '#899c94');
      addPart('box', [0, 0.91, 0], [2.18, 0.06, 0.84], '#e5e2d8', { rounded: true });
      if (kind === 'furniture/checkout-counter') {
        addPart('box', [0.3, 1.12, 0], [0.42, 0.34, 0.28], '#334247');
      }
      addCollider(0, 0, 2.1, 0.8);
    } else if (kind === 'furniture/fridge') {
      addPart('box', [0, 0.92, 0], [0.78, 1.84, 0.8], '#cfd6d5', {
        rounded: true,
        roughness: 0.35,
      });
      addCollider(0, 0, 0.8, 0.8);
    } else if (kind === 'furniture/stove') {
      addPart('box', [0, 0.45, 0], [0.78, 0.9, 0.74], '#d8dedc', { rounded: true });
      addPart('box', [0, 0.91, 0], [0.76, 0.03, 0.7], '#283236');
      addCollider(0, 0, 0.8, 0.75);
    } else if (kind === 'furniture/bathtub') {
      addPart('box', [0, 0.34, 0], [1.72, 0.64, 0.82], '#eef0ea', {
        rounded: true,
        roughness: 0.25,
      });
      addPart('box', [0, 0.54, 0], [1.46, 0.04, 0.62], '#8cc0c7', { opacity: 0.75 });
      addCollider(0, 0, 1.72, 0.82);
    } else if (kind === 'furniture/floor-lamp') {
      addPart('cylinder', [0, 0.03, 0], [0.36, 0.06, 0.36], '#66706e');
      addPart('cylinder', [0, 0.75, 0], [0.05, 1.45, 0.05], '#889491');
      addPart('shade', [0, 1.48, 0], [0.46, 0.32, 0.46], '#f5ebd6', { emission: 0.35 });
    } else if (kind === 'furniture/shop-display' || kind === 'furniture/storage-rack') {
      const h = kind === 'furniture/storage-rack' ? 2.1 : 1.45;
      for (const side of [-0.95, 0.95])
        addPart('box', [side, h / 2, 0], [0.08, h, 0.75], '#596b70');
      for (const y of [0.25, 0.75, 1.25, ...(h > 1.6 ? [1.85] : [])])
        addPart('box', [0, y, 0], [2.0, 0.06, 0.75], '#c2a37a');
      addCollider(0, 0, 2.0, 0.75);
    } else if (kind === 'furniture/shop-sign') {
      addPart('box', [0, 2.2, 0], [2.4, 0.65, 0.16], '#2e4752', { rounded: true });
      addPart('box', [0, 2.2, 0.09], [2.2, 0.48, 0.03], '#f2d07c', { emission: 0.3 });
    } else if (kind === 'furniture/workbench') {
      addPart('box', [0, 0.88, 0], [1.9, 0.09, 0.8], '#b8966c', { rounded: true });
      for (const dx of [-0.82, 0.82])
        for (const dz of [-0.32, 0.32])
          addPart('box', [dx, 0.42, dz], [0.08, 0.84, 0.08], '#4c5b61');
      addCollider(0, 0, 1.9, 0.8);
    } else if (kind === 'furniture/machinery') {
      addPart('box', [0, 0.55, 0], [2.0, 1.1, 1.3], '#58737a', { rounded: true });
      addPart('box', [0, 1.35, -0.1], [1.4, 0.6, 0.9], '#8ca3a8', { rounded: true });
      addCollider(0, 0, 2.0, 1.3);
    } else if (kind === 'furniture/conveyor') {
      addPart('box', [0, 0.72, 0], [3.3, 0.16, 0.85], '#49585e');
      for (let x = -1.4; x <= 1.41; x += 0.35)
        addPart('cylinder', [x, 0.81, 0], [0.12, 0.78, 0.12], '#a3b2b5', {
          rotation: [Math.PI / 2, 0, 0],
        });
      addCollider(0, 0, 3.3, 0.85);
    } else if (kind === 'furniture/shipping-container') {
      addPart('box', [0, 1.2, 0], [3.2, 2.4, 2.2], matColor || '#476b78');
      addCollider(0, 0, 3.2, 2.2);
    } else if (kind === 'furniture/streetlight') {
      addPart('cylinder', [0, 2.0, 0], [0.14, 4.0, 0.14], '#5d6b6e');
      addPart('box', [0.35, 3.95, 0], [0.8, 0.1, 0.22], '#5d6b6e');
      const on = Object.values(deviceOutputs).some((v) => v > 0);
      addPart('box', [0.62, 3.88, 0], [0.32, 0.08, 0.2], on ? '#ffe89e' : '#cfd6d2', {
        emission: on ? 0.85 : 0.08,
        streetlightLamp: true,
      });
      addCollider(0, 0, 0.3, 0.3);
    } else if (kind === 'furniture/bench') {
      addPart('box', [0, 0.45, 0], [1.8, 0.08, 0.6], '#b08d63');
      addPart('box', [0, 0.76, -0.25], [1.8, 0.45, 0.08], '#b08d63');
      for (const dx of [-0.7, 0.7]) addPart('box', [dx, 0.22, 0], [0.1, 0.44, 0.56], '#526163');
      addCollider(0, 0, 1.8, 0.65);
    } else if (kind === 'furniture/bin') {
      addPart('cylinder', [0, 0.48, 0], [0.52, 0.95, 0.52], '#4b6b5c');
      addCollider(0, 0, 0.55, 0.55);
    } else if (kind === 'furniture/playground-slide') {
      addPart('box', [0, 1.4, -0.8], [1.2, 0.12, 1.2], '#d4ae6a');
      for (const dx of [-0.5, 0.5])
        for (const dz of [-1.3, -0.3])
          addPart('cylinder', [dx, 0.7, dz], [0.09, 1.4, 0.09], '#628894');
      addPart('box', [0, 0.75, 0.8], [0.85, 0.1, 2.4], '#d98254', { rotation: [0.52, 0, 0] });
      addCollider(0, 0, 2.2, 3.4);
    } else if (kind === 'furniture/garden-bed') {
      addPart('box', [0, 0.25, 0], [2.6, 0.5, 1.4], '#9e7b56');
      addPart('box', [0, 0.46, 0], [2.42, 0.1, 1.22], '#634f3b');
      for (const dx of [-0.8, 0, 0.8]) {
        const [wx, wy, wz] = toWorldPos(dx, 0.48, 0);
        buildCrop(model, wx, wz, 0.7, wy);
      }
      addCollider(0, 0, 2.6, 1.4);
    } else if (kind === 'furniture/water-tank') {
      addPart('cylinder', [0, 1.1, 0], [2.0, 2.2, 2.0], '#6c96a6');
      addCollider(0, 0, 2.0, 2.0);
    }
    return { parts, colliders };
  }

  // ---- 4. Infrastructure & Traffic ----
  if (kind.startsWith('infra/')) {
    if (kind === 'infra/traffic-light') {
      addPart('cylinder', [0, 1.7, 0], [0.14, 3.4, 0.14], '#4c585c');
      addPart('box', [0, 3.1, 0.12], [0.36, 0.92, 0.22], '#2b3336');
      addPart('sphere', [0, 3.38, 0.22], [0.18, 0.18, 0.1], '#e8604c', { emission: 0.4 });
      addPart('sphere', [0, 3.1, 0.22], [0.18, 0.18, 0.1], '#f0a73a', { emission: 0.2 });
      addPart('sphere', [0, 2.82, 0.22], [0.18, 0.18, 0.1], '#5fd38a', { emission: 0.75 });
    } else if (kind === 'infra/pedestrian-signal') {
      addPart('cylinder', [0, 1.25, 0], [0.12, 2.5, 0.12], '#566366');
      addPart('box', [0, 2.2, 0.1], [0.32, 0.52, 0.18], '#2b3336');
      addPart('sphere', [0, 2.1, 0.18], [0.15, 0.15, 0.08], '#5fd38a', { emission: 0.65 });
    } else if (kind === 'infra/road-sign') {
      addPart('cylinder', [0, 1.1, 0], [0.08, 2.2, 0.08], '#7c878a');
      addPart('cylinder', [0, 2.05, 0.06], [0.55, 0.06, 0.55], '#d9534f', {
        rotation: [Math.PI / 2, 0, 0],
      });
    } else if (kind === 'infra/bridge') {
      addPart('box', [0, 0.6, 0], [8, 0.35, 14], '#9da39e');
      for (const side of [-3.7, 3.7]) addPart('box', [side, 1.15, 0], [0.35, 0.85, 14], '#7d8580');
    } else if (kind === 'infra/parking-lot') {
      addPart('box', [0, 0.03, 0], [9, 0.06, 5.5], '#596063', { rounded: false });
      for (const dx of [-4.3, -1.45, 1.45, 4.3])
        addPart('box', [dx, 0.065, 0], [0.12, 0.02, 4.8], '#e8e4d5', { rounded: false });
    } else if (kind === 'infra/bus-stop') {
      addPart('box', [0, 0.06, 0], [3.2, 0.12, 1.6], '#9fa39d');
      addPart('box', [0, 1.2, -0.7], [3.0, 2.2, 0.08], '#7fa7b2', { opacity: 0.6 });
      addPart('box', [0, 2.32, 0], [3.2, 0.12, 1.6], '#4d5c61');
    } else if (kind === 'infra/vehicle-car') {
      const c = props.color || '#4f8699';
      addPart('box', [0, 0.42, 0], [1.65, 0.46, 3.2], c, { rounded: true, roughness: 0.3 });
      addPart('box', [0, 0.82, -0.15], [1.38, 0.44, 1.65], c, { rounded: true, roughness: 0.3 });
      for (const sxSign of [-0.78, 0.78])
        for (const szSign of [-1.0, 1.0])
          addPart('cylinder', [sxSign, 0.28, szSign], [0.56, 0.18, 0.56], '#2b3336', {
            rotation: [0, 0, Math.PI / 2],
          });
    } else if (kind === 'infra/pedestrian') {
      const c = props.color || '#5b8a72';
      addPart('cylinder', [0, 0.42, 0], [0.28, 0.84, 0.28], '#485863');
      addPart('box', [0, 1.05, 0], [0.42, 0.55, 0.26], c, { rounded: true });
      addPart('sphere', [0, 1.52, 0], [0.28, 0.3, 0.28], '#d8b08c');
    }
    return { parts, colliders };
  }

  // ---- 5. Nature & Vegetation ----
  if (kind.startsWith('nature/')) {
    const sub = kind.split('/')[1];
    if (['broadleaf', 'conifer', 'palm', 'eucalypt'].includes(sub)) {
      const tree = buildTree(model, ox, oz, sx, {
        style: sub,
        detailed: true,
        extra: { wbId: obj.id, editGroup: obj.id },
      });
      for (const p of tree.parts) {
        p.pos[1] += oy;
        p.wbId = obj.id;
        p.editGroup = obj.id;
        parts.push(p);
      }
      addCollider(0, 0, 0.8, 0.8);
    } else if (sub === 'bush') {
      addPart('foliage', [0, 0.48, 0], [1.25, 0.95, 1.25], '#5e8756');
      addPart('foliage', [0.25, 0.38, 0.18], [0.85, 0.7, 0.85], '#6d9663');
    } else if (sub === 'flower') {
      addPart('cylinder', [0, 0.18, 0], [0.06, 0.36, 0.06], '#5c854c');
      for (const [dx, dz, col] of [
        [0, 0, '#e87a90'],
        [0.22, 0.15, '#f2c14e'],
        [-0.2, 0.12, '#9b7ede'],
      ]) {
        addPart('sphere', [dx, 0.36, dz], [0.22, 0.16, 0.22], col);
      }
    } else if (sub === 'grass-tuft') {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        addPart(
          'leaf',
          [Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12],
          [0.35, 0.38, 0.14],
          '#729958',
          {
            rotation: [0, a, 0.25],
          },
        );
      }
    } else if (sub === 'rock') {
      addPart('sphere', [0, 0.42, 0], [1.45, 0.95, 1.25], '#8a918e', { roughness: 0.95 });
      addPart('sphere', [0.35, 0.28, 0.25], [0.85, 0.6, 0.75], '#7a827f', { roughness: 0.95 });
      addCollider(0, 0, 1.3, 1.1);
    }
    return { parts, colliders };
  }

  // ---- 6. IoT Devices & Microcontrollers ----
  if (kind.startsWith('iot/')) {
    if (kind === 'iot/board-esp32' || kind === 'iot/board-pico') {
      const isEsp = kind === 'iot/board-esp32';
      addPart('box', [0, 0.45, 0], [0.55, 0.9, 0.4], '#394a4d', { rounded: true });
      addPart('box', [0, 0.94, 0], [0.48, 0.08, 0.34], isEsp ? '#243b4a' : '#2a6b4e', {
        rounded: true,
      });
      addPart('sphere', [0.16, 0.99, 0.1], [0.06, 0.04, 0.06], '#5fd38a', { emission: 0.7 });
      addCollider(0, 0, 0.55, 0.4);
      return { parts, colliders };
    }

    const compId = props.componentId || kind.slice(4);
    const comp = getComponentSpec(compId) || {
      id: compId,
      name: obj.name || compId,
      output: false,
    };
    const isActive =
      comp.output && props.pin !== null && props.pin !== undefined
        ? (deviceOutputs[props.pin] || 0) > 0
        : false;
    // Pedestal + holder + status face, matching IoTQuest's addDeviceDetails convention
    const post = addPart('cylinder', [0, 0.22, 0], [0.07, 0.44, 0.07], '#687d7a');
    const holder = addPart(
      'box',
      [0, 0.54, 0.06],
      [0.28, 0.28, 0.08],
      comp.output ? '#cad4cf' : '#38675d',
      { rounded: true },
    );
    const face = addPart(
      'box',
      [0.075, 0.656, 0.06],
      [0.06, 0.025, 0.04],
      isActive ? '#5fd38a' : '#7b8c88',
      { emission: isActive ? 0.85 : 0.1 },
    );
    const record = {
      device: { ...comp, pin: props.pin ?? 0 },
      x: ox,
      z: oz,
      post,
      holder,
      face,
      parts,
    };
    const beforeCount = model.objects.length;
    addDeviceDetails(model, record, oy);
    for (const m of model.objects.slice(beforeCount)) {
      m.wbId = obj.id;
      m.editGroup = obj.id;
      if (!parts.includes(m)) parts.push(m);
    }
    return { parts, colliders };
  }

  // An imported model is drawn by the viewport; here it is only something to click: the model's
  // own size once it has loaded (nearly invisible), a faint box while it loads.
  if (kind.startsWith('imported/')) {
    const size = options.importedSize;
    if (size) addPart('box', [0, size[3], 0], size.slice(0, 3), '#4f9cf9', { opacity: 0.02 });
    else addPart('box', [0, 0.5, 0], [1, 1, 1], '#8fa39b', { opacity: 0.35 });
    return { parts, colliders };
  }

  // Fallback box
  addPart('box', [0, 0.5, 0], [1, 1, 1], matColor || '#8fa39b');
  return { parts, colliders };
}

// Builds road, footpath and driveway segments from control points.
export function buildRoadMeshes(model, roads = [], terrain = null, terrainHeightFn = () => 0) {
  for (const road of roads) {
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const width =
      Number(road.width) || (road.kind === 'footpath' ? 2.2 : road.kind === 'driveway' ? 4.2 : 8);
    const isFootpath = road.kind === 'footpath';
    const isDriveway = road.kind === 'driveway';
    const isBridge = road.kind === 'bridge';
    const surfaceColor = isFootpath ? '#cfc8b4' : isDriveway ? '#8d918c' : '#4a5257';

    // Sample smooth curve if curvature/bend is set or multiple points exist
    const samples = sampleRoadPoints(pts, road.curvature || 0);
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i],
        b = samples[i + 1];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2;
      const groundY = Math.max(
        terrainHeightFn(terrain, a.x, a.z),
        terrainHeightFn(terrain, b.x, b.z),
      );
      const y = isBridge ? Math.max(groundY + 1.5, 1.5) : groundY + 0.05;
      const angle = Math.atan2(dx, dz);

      // Road bed
      model.mesh(
        'box',
        [mx, y, mz],
        [width, isBridge ? 0.35 : 0.08, len + width * 0.25],
        surfaceColor,
        {
          rotation: [0, angle, 0],
          roughness: 0.9,
          wbRoadId: road.id,
          rounded: false,
        },
      );

      // Kerbs & dashed centre line for main roads
      if (!isFootpath && !isDriveway && width >= 6) {
        model.mesh('box', [mx, y + 0.045, mz], [0.16, 0.02, len * 0.55], '#e6e1cf', {
          rotation: [0, angle, 0],
          wbRoadId: road.id,
          rounded: false,
        });
      }

      // Zebra crossing stripes if enabled on road
      if (road.crossing && i === Math.floor((samples.length - 1) / 2)) {
        for (let s = -width * 0.35; s <= width * 0.35; s += 0.75) {
          const cx = mx + Math.cos(angle) * s;
          const cz = mz - Math.sin(angle) * s;
          model.mesh('box', [cx, y + 0.05, cz], [0.38, 0.02, 2.2], '#f2efe4', {
            rotation: [0, angle, 0],
            wbRoadId: road.id,
            rounded: false,
          });
        }
      }
    }
  }
}

export function sampleRoadPoints(points, curvature = 0) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  if (!curvature || points.length === 2) {
    if (!curvature) return points;
    const [a, b] = points;
    const mx = (a.x + b.x) / 2 - (b.z - a.z) * curvature * 0.25;
    const mz = (a.z + b.z) / 2 + (b.x - a.x) * curvature * 0.25;
    const out = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8,
        u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * mx + t * t * b.x,
        z: u * u * a.z + 2 * u * t * mz + t * t * b.z,
      });
    }
    return out;
  }
  return points;
}
