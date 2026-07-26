const DISTRICTS = ['Crimson', 'Frost', 'Nova', 'Blitz', 'Eclipse'];

const BUILDINGS = {
	house: { name: 'Habitat Pod', icon: '⌂', unlock: 0, baseCost: { coins: 80, materials: 20 }, time: 8, production: { coins: 5, population: 2 }, power: 3, category: 'residential' },
	lumber: { name: 'Lumber Mill', icon: '▥', unlock: 0, baseCost: { coins: 130, materials: 35 }, time: 12, production: { materials: 8 }, power: 4, category: 'industry' },
	wind: { name: 'Wind Array', icon: '✦', unlock: 0, baseCost: { coins: 160, materials: 50 }, time: 15, production: { energy: 6 }, power: 5, category: 'energy' },
	market: { name: 'Neon Market', icon: '◆', unlock: 20, baseCost: { coins: 300, materials: 90 }, time: 25, production: { coins: 18 }, power: 8, category: 'commerce' },
	quarry: { name: 'Crystal Quarry', icon: '⬡', unlock: 45, baseCost: { coins: 450, materials: 120 }, time: 35, production: { materials: 22 }, power: 11, category: 'industry' },
	solar: { name: 'Solar Plant', icon: '☀', unlock: 80, baseCost: { coins: 700, materials: 200 }, time: 50, production: { energy: 20 }, power: 15, category: 'energy' },
	apartments: { name: 'Sky Apartments', icon: '▤', unlock: 120, baseCost: { coins: 1000, materials: 340 }, time: 75, production: { coins: 14, population: 12 }, power: 20, category: 'residential' },
	mine: { name: 'Deepcore Mine', icon: '◇', unlock: 220, baseCost: { coins: 1800, materials: 520 }, time: 110, production: { materials: 65 }, power: 30, category: 'industry' },
	bank: { name: 'Quantum Bank', icon: '◈', unlock: 400, baseCost: { coins: 3200, materials: 900 }, time: 160, production: { coins: 125 }, power: 45, category: 'commerce' },
	factory: { name: 'Fusion Factory', icon: '⚙', unlock: 650, baseCost: { coins: 5200, materials: 1500 }, time: 240, production: { coins: 90, materials: 55, energy: -18 }, power: 70, category: 'industry' },
	lab: { name: 'Research Lab', icon: '⚗', unlock: 900, baseCost: { coins: 8000, materials: 2400 }, time: 360, production: {}, power: 90, category: 'research' },
	hq: { name: 'Military HQ', icon: '▲', unlock: 1500, baseCost: { coins: 14000, materials: 4200 }, time: 600, production: {}, power: 240, category: 'district' },
};

const RESEARCH = {
	mining: { name: 'Efficient Mining', description: '+10% materials', cost: { coins: 2500, materials: 900 }, time: 90, requires: null },
	construction: { name: 'Advanced Construction', description: 'Upgrades finish 15% faster', cost: { coins: 4500, materials: 1500 }, time: 150, requires: 'mining' },
	renewable: { name: 'Renewable Energy', description: '+20% energy', cost: { coins: 6500, materials: 2200 }, time: 240, requires: 'construction' },
	growth: { name: 'Population Growth', description: '+10% population', cost: { coins: 9000, materials: 3000 }, time: 360, requires: 'renewable' },
	economy: { name: 'Industrial Economy', description: '+15% coins', cost: { coins: 14000, materials: 4800 }, time: 520, requires: 'growth' },
	automation: { name: 'Automation', description: '+15% all production', cost: { coins: 22000, materials: 7500 }, time: 750, requires: 'economy' },
};

function upgradeCost(key, level) {
	const building = BUILDINGS[key];
	const multiplier = 1.55 ** level;
	return Object.fromEntries(Object.entries(building.baseCost).map(([resource, value]) => [resource, Math.ceil(value * multiplier)]));
}

function upgradeSeconds(key, level, research = []) {
	const multiplier = research.includes('construction') ? 0.85 : 1;
	return Math.ceil(BUILDINGS[key].time * (1.18 ** level) * multiplier);
}

module.exports = { BUILDINGS, DISTRICTS, RESEARCH, upgradeCost, upgradeSeconds };
