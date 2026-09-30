const axios = require('axios');

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const SIZES = { staand: '1024x1536', liggend: '1536x1024', vierkant: '1024x1024' };
const DETAILS = {
	eenvoudig: 'Large open coloring areas, bold outlines, few details, suitable for young children.',
	gemiddeld: 'Balanced detail, clear outlines and comfortably sized coloring areas.',
	uitgebreid: 'Intricate, carefully organized details for adults, with distinct colorable shapes.',
};

function validateAttachment(attachment) {
	if (!attachment) return;
	if (!['image/png', 'image/jpeg', 'image/webp'].includes(attachment.contentType)) {
		throw new Error('Upload een PNG-, JPG- of WebP-afbeelding.');
	}
	if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > MAX_INPUT_BYTES) {
		throw new Error('De referentieafbeelding mag maximaal 10 MB groot zijn.');
	}
	let url;
	try { url = new URL(attachment.url); } catch { /* Handled below. */ }
	if (!url || url.protocol !== 'https:' || url.username || url.password || url.port
		|| !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
		|| !url.pathname.startsWith('/attachments/')) {
		throw new Error('Gebruik een afbeelding die je rechtstreeks als Discord-bijlage uploadt.');
	}
}

function buildPrompt(requirements, detail, hasReference) {
	return [
		'Create one polished, professional printable coloring book page.',
		hasReference ? 'Use the supplied image as a visual reference. Preserve recognizable subjects and key features unless the requirements request changes.' : 'Create an original composition based on the requirements.',
		'Use crisp black contour line art on a pure white background. Use clean closed shapes and consistent deliberate line weights.',
		'No color, gray fills, shading, gradients, hatching, solid black areas, watermarks, signatures or page mockups. Leave all coloring areas white.',
		'Keep a generous white print margin on every edge. Do not crop the subjects. Avoid stray lines and overlapping or ambiguous contours.',
		'Only include lettering if explicitly requested. Deliver only the finished coloring page.',
		DETAILS[detail],
		'Apply these user requirements to the subject, composition and style while retaining the coloring-page format:',
		requirements,
	].join('\n');
}

async function generateColoringPage({ requirements, attachment, orientation = 'staand', detail = 'gemiddeld', maxOutputBytes = MAX_OUTPUT_BYTES }) {
	validateAttachment(attachment);
	if (typeof requirements !== 'string' || !requirements.trim() || requirements.length > 2000) {
		throw new Error('Beschrijf je eisen in 1 tot 2000 tekens.');
	}
	if (!SIZES[orientation] || !DETAILS[detail]) throw new Error('Ongeldig formaat of detailniveau.');
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error('De beheerder moet eerst OPENAI_API_KEY instellen voor /kleurplaat.');
	const body = {
		model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
		prompt: buildPrompt(requirements.trim(), detail, Boolean(attachment)),
		size: SIZES[orientation], quality: 'high', output_format: 'png', background: 'opaque', n: 1,
	};
	if (attachment) body.images = [{ image_url: attachment.url }];
	const { data } = await axios.post(`https://api.openai.com/v1/images/${attachment ? 'edits' : 'generations'}`, body, {
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		timeout: 600000,
		maxContentLength: 24 * 1024 * 1024,
		maxBodyLength: 64 * 1024,
	});
	const encoded = data?.data?.[0]?.b64_json;
	if (typeof encoded !== 'string' || !encoded.length) throw new Error('De beeldgenerator heeft geen afbeelding teruggegeven. Probeer het opnieuw.');
	const buffer = Buffer.from(encoded, 'base64');
	if (!buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
		throw new Error('De beeldgenerator gaf geen geldig PNG-bestand terug. Probeer het opnieuw.');
	}
	if (buffer.length > Math.min(maxOutputBytes, MAX_OUTPUT_BYTES)) {
		throw new Error('De kleurplaat is te groot voor een Discord-download. Probeer minder details of een vierkant formaat.');
	}
	return buffer;
}

module.exports = { generateColoringPage, validateAttachment };
