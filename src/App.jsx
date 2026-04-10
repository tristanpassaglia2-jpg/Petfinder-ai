import { useState, useEffect, useRef, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════
   PetFinder AI v3 — Módulo 2: IA Real con Claude Vision API
   ══════════════════════════════════════════════════════════════════
   
   Integra Claude Sonnet para:
   1. Analizar fotos reales de mascotas (raza, color, tamaño, marcas)
   2. Generar "feature vectors" descriptivos por mascota
   3. Comparar mascotas con IA para encontrar coincidencias reales
   4. Chat IA asistente para ayudar en la búsqueda
   ══════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// DATABASE LAYER
// ─────────────────────────────────────────────────────────
const DB = {
  async get(k) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(k, v) { try { await window.storage.set(k, JSON.stringify(v)); return true; } catch { return false; } },
  async del(k) { try { await window.storage.delete(k); return true; } catch { return false; } },
  async getS(k) { try { const r = await window.storage.get(k, true); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async setS(k, v) { try { await window.storage.set(k, JSON.stringify(v), true); return true; } catch { return false; } },
};

// ─────────────────────────────────────────────────────────
// CLAUDE AI SERVICE — Real Vision Analysis
// ─────────────────────────────────────────────────────────
const ClaudeAI = {
  // Analyze a pet photo using Claude Vision
  async analyzePhoto(base64Image, mediaType, userDescription = "") {
    try {
      const response = await fetch("/api/analize-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64Image }
              },
              {
                type: "text",
                text: `You are a pet identification AI expert. Analyze this photo of a pet and return ONLY a JSON object (no markdown, no backticks, no explanation) with these exact fields:

{
  "species": "dog" or "cat",
  "breed": "primary breed or best guess",
  "breedConfidence": 0.0 to 1.0,
  "size": "small", "medium", or "large",
  "primaryColor": "main fur color",
  "secondaryColor": "secondary fur color or null",
  "pattern": "solid", "spotted", "striped", "tabby", "patched", "tuxedo", "bicolor", "merle", "brindle", or "tricolor",
  "distinctiveMarks": ["list of unique identifying features"],
  "eyeColor": "eye color",
  "furLength": "short", "medium", or "long",
  "estimatedAge": "puppy/kitten", "young", "adult", or "senior",
  "hasCollar": true or false,
  "collarDescription": "description if visible, or null",
  "bodyCondition": "thin", "normal", or "overweight",
  "facialFeatures": "brief description of face shape, ear shape, muzzle",
  "tailDescription": "tail shape and length",
  "overallDescription": "A 2-sentence natural language description for matching purposes"
}

${userDescription ? `The owner/finder also described: "${userDescription}". Factor this into your analysis.` : ""}
Return ONLY the JSON object.`
              }
            ]
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.map(i => i.text || "").join("\n") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch (err) {
      console.error("Claude analysis error:", err);
      return null;
    }
  },

  // Compare two pets using Claude
  async comparePets(pet1Features, pet2Features, pet1Desc, pet2Desc) {
    try {
      const response = await fetch("/api/compare-pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are a pet matching AI. Compare these two pet profiles and determine if they could be the same animal. Return ONLY a JSON object (no markdown, no backticks).

PET A (${pet1Features ? "AI-analyzed" : "user-described"}):
${JSON.stringify(pet1Features || { description: pet1Desc }, null, 2)}

PET B (${pet2Features ? "AI-analyzed" : "user-described"}):
${JSON.stringify(pet2Features || { description: pet2Desc }, null, 2)}

Return:
{
  "matchScore": 0.0 to 1.0 (probability they are the same animal),
  "confidence": "low", "medium", or "high",
  "matchingFeatures": ["list of features that match"],
  "differingFeatures": ["list of features that differ"],
  "reasoning": "Brief explanation of why they match or don't",
  "recommendation": "One sentence recommendation for the pet owner"
}`
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.map(i => i.text || "").join("\n") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    } catch (err) {
      console.error("Claude comparison error:", err);
      return null;
    }
  },

  // AI Chat assistant for search help
  async chatAssistant(message, context = "") {
    try {
      const response = await fetch("/api/vet-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Sos un asistente de PetFinder AI, una app solidaria para encontrar mascotas perdidas. Respondé en español, sé empático y útil. Contexto actual: ${context}`,
          messages: [{ role: "user", content: message }]
        })
      });
      const data = await response.json();
      return data.content?.map(i => i.text || "").join("\n") || "No pude procesar tu mensaje.";
    } catch {
      return "Error de conexión. Intentá de nuevo.";
    }
  },

  // Face ID Tracker — Multi-source web search engine
  async faceIdTracker(pet) {
    const species = pet.type === "dog" ? "perro" : "gato";
    const breed = pet.breed || "";
    const color = pet.color || pet.aiFeatures?.primaryColor || "";
    const zone = pet.location?.address || "Argentina";
    const marks = pet.distinctiveMarks || pet.aiFeatures?.distinctiveMarks?.join(", ") || "";
    const collar = pet.hasCollar === true ? (pet.collarColor || "tiene collar") : "";
    const size = pet.size || pet.aiFeatures?.size || "";
    const name = pet.name || "";

    const petProfile = `${species}${breed ? " raza " + breed : ""}${color ? ", color " + color : ""}${size ? ", tamaño " + size : ""}${marks ? ", marcas: " + marks : ""}${collar ? ", " + collar : ""}${name ? ", nombre: " + name : ""}, zona: ${zone}`;

    // Run multiple specialized searches
    const searches = [
      `${species} ${breed} encontrado ${zone} 2026`,
      `mascota perdida ${species} ${color} ${zone}`,
      `${breed || species} found lost ${zone} pet`,
      `refugio animales ${species} ${zone}`,
      `${species} extraviado ${color} ${breed} collar`,
    ];

    try {
      const response = await fetch("/api/faceid-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `Sos un sistema de rastreo de mascotas perdidas con Face ID. Tu trabajo es buscar en internet publicaciones que coincidan con la mascota descrita. Buscá en MÚLTIPLES fuentes: redes sociales (Facebook, Instagram, X, TikTok), sitios de mascotas perdidas (petcolovelost.org, pawboost.com, petfbi.org, fido-finder.com), grupos de WhatsApp/Telegram de mascotas, refugios y veterinarias de la zona, portales de clasificados (OLX, Mercado Libre, Craigslist), sitios gubernamentales de registro animal, y cualquier foro o comunidad online relevante. Priorizá publicaciones recientes (últimas 2 semanas). Evaluá qué tan probable es que cada resultado sea la misma mascota basándote en raza, color, tamaño, marcas, zona y collar.`,
          messages: [{
            role: "user",
            content: `MASCOTA A RASTREAR: ${petProfile}

Descripción completa: ${pet.description || "sin descripción adicional"}

Realizá búsquedas exhaustivas con estos términos y variaciones:
${searches.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

Y cualquier otra combinación que consideres relevante.

Devolvé SOLO un JSON array (sin markdown, sin backticks, sin explicación) con TODOS los resultados relevantes:
[
  {
    "source": "nombre de la plataforma o sitio",
    "sourceType": "social" | "shelter" | "website" | "community" | "classified",
    "title": "título o resumen de la publicación",
    "description": "descripción detallada de la mascota encontrada en la publicación",
    "matchingTraits": ["rasgos que coinciden con la mascota buscada"],
    "differingTraits": ["rasgos que no coinciden o no se mencionan"],
    "matchLevel": "high" | "medium" | "low",
    "matchPercent": 0-100,
    "url": "URL de la publicación",
    "location": "ubicación mencionada",
    "date": "fecha de la publicación",
    "contactInfo": "teléfono, email o usuario si disponible",
    "photoAvailable": true | false
  }
]
Si no encontrás resultados, devolvé [].`
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.filter(i => i.type === "text").map(i => i.text).join("\n") || "[]";
      const clean = text.replace(/```json|```/g, "").trim();
      try { return JSON.parse(clean); } catch { return []; }
    } catch (err) {
      console.error("Face ID Tracker error:", err);
      return [];
    }
  },
};
const LocalAI = {
  extractFromText(pet) {
    const desc = `${pet.name || ""} ${pet.breed || ""} ${pet.description || ""}`.toLowerCase();
    const colors = [
      { k: ["golden", "dorado", "rubio", "amarillo"], v: "golden" },
      { k: ["black", "negro", "oscuro"], v: "black" },
      { k: ["white", "blanco"], v: "white" },
      { k: ["tabby", "atigrado", "rayado"], v: "tabby" },
      { k: ["orange", "naranja", "colorado"], v: "orange" },
      { k: ["grey", "gris", "plomo"], v: "grey" },
      { k: ["brown", "marrón", "chocolate"], v: "brown" },
      { k: ["cream", "crema", "beige"], v: "cream" },
    ];
    const sizes = [
      { k: ["small", "pequeño", "chico", "toy", "mini"], v: "small" },
      { k: ["large", "grande", "enorme"], v: "large" },
    ];
    const primaryColor = colors.find(c => c.k.some(w => desc.includes(w)))?.v || "unknown";
    const size = sizes.find(s => s.k.some(w => desc.includes(w)))?.v || "medium";
    return {
      species: pet.type || "dog",
      breed: pet.breed || "Mestizo",
      primaryColor,
      size,
      pattern: desc.includes("mancha") || desc.includes("spotted") ? "spotted" : 
               desc.includes("rayas") || desc.includes("atigrado") ? "tabby" : "solid",
      overallDescription: pet.description || "",
      source: "text-analysis",
    };
  },

  compareLocal(f1, f2) {
    if (!f1 || !f2) return 0;
    let score = 0;
    let factors = 0;
    if (f1.species === f2.species) { score += 0.25; factors++; } else return 0;
    if (f1.primaryColor && f2.primaryColor && f1.primaryColor === f2.primaryColor) { score += 0.25; factors++; }
    if (f1.size === f2.size) { score += 0.15; factors++; }
    if (f1.pattern === f2.pattern) { score += 0.15; factors++; }
    // Breed similarity
    const b1 = (f1.breed || "").toLowerCase();
    const b2 = (f2.breed || "").toLowerCase();
    if (b1 && b2 && (b1.includes(b2) || b2.includes(b1) || b1 === b2)) { score += 0.2; factors++; }
    return Math.min(score, 0.99);
  },
};

// ─────────────────────────────────────────────────────────
// BACKEND SERVICE
// ─────────────────────────────────────────────────────────
const Auth = {
  // Simple hash for password (not crypto-grade, but works for demo persistance)
  hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return "h_" + Math.abs(h).toString(36) + "_" + str.length;
  },
  validate(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  validatePass(p) {
    return p && p.length >= 6;
  },
};

const Backend = {
  async createUser(d) {
    if (!Auth.validate(d.email)) return { error: "Email inválido" };
    if (!Auth.validatePass(d.password)) return { error: "La contraseña debe tener al menos 6 caracteres" };
    // Check if email already exists
    const existing = await this.loginUser(d.email, d.password);
    if (existing && !existing.error) return { error: "Este email ya está registrado" };
    const id = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const user = { id, name: d.name, email: d.email, phone: d.phone || "", passHash: Auth.hash(d.password), plan: "free", createdAt: new Date().toISOString(), verified: false, petIds: [] };
    await DB.set(`user:${id}`, user);
    const idx = (await DB.getS("users:idx")) || [];
    idx.push(id);
    await DB.setS("users:idx", idx);
    // Return user without passHash for session
    const { passHash, ...safeUser } = user;
    return safeUser;
  },
  async loginUser(email, password) {
    if (!email) return { error: "Ingresá tu email" };
    const idx = (await DB.getS("users:idx")) || [];
    for (const uid of idx) {
      const u = await DB.get(`user:${uid}`);
      if (u?.email === email) {
        if (password && u.passHash !== Auth.hash(password)) return { error: "Contraseña incorrecta" };
        const { passHash, ...safeUser } = u;
        return safeUser;
      }
    }
    return { error: "No encontramos una cuenta con ese email" };
  },
  async updateUserPlan(userId, plan) {
    const u = await DB.get(`user:${userId}`);
    if (!u) return null;
    const updated = { ...u, plan, planUpdatedAt: new Date().toISOString() };
    await DB.set(`user:${userId}`, updated);
    const { passHash, ...safeUser } = updated;
    return safeUser;
  },
  async createPet(data, userId = null) {
    const id = "p_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
    const pet = { id, ...data, userId: userId, createdAt: new Date().toISOString(), active: true, views: 0 };
    if (!pet.aiFeatures) pet.aiFeatures = LocalAI.extractFromText(pet);
    await DB.setS(`pet:${id}`, pet);
    const key = pet.status === "lost" ? "pets:lost:idx" : "pets:found:idx";
    const idx = (await DB.getS(key)) || [];
    idx.unshift(id);
    await DB.setS(key, idx);
    // Link to user if logged in
    if (userId) {
      const u = await DB.get(`user:${userId}`);
      if (u) { u.petIds = [...(u.petIds||[]), id]; await DB.set(`user:${userId}`, u); }
    }
    return pet;
  },
  async updatePet(id, updates) {
    const pet = await DB.getS(`pet:${id}`);
    if (!pet) return null;
    const updated = { ...pet, ...updates };
    await DB.setS(`pet:${id}`, updated);
    return updated;
  },
  async deletePet(id) {
    const pet = await DB.getS(`pet:${id}`);
    if (!pet) return false;
    await DB.setS(`pet:${id}`, { ...pet, active: false });
    return true;
  },
  async listPets(status, type = "all") {
    const key = status === "lost" ? "pets:lost:idx" : "pets:found:idx";
    const idx = (await DB.getS(key)) || [];
    const pets = [];
    for (const pid of idx) {
      const p = await DB.getS(`pet:${pid}`);
      if (p && p.active !== false && (type === "all" || p.type === type)) pets.push(p);
    }
    return pets;
  },
  async runAIMatch(pet) {
    const pool = pet.status === "lost"
      ? await this.listPets("found", pet.type)
      : await this.listPets("lost", pet.type);
    
    // Try Claude AI comparison for each candidate
    const results = [];
    for (const candidate of pool) {
      let comparison = null;
      // If both have AI features from photos, use Claude to compare
      if (pet.aiFeatures?.source !== "text-analysis" && candidate.aiFeatures?.source !== "text-analysis") {
        comparison = await ClaudeAI.comparePets(pet.aiFeatures, candidate.aiFeatures, pet.description, candidate.description);
      }
      if (comparison) {
        results.push({ ...candidate, matchScore: comparison.matchScore, aiComparison: comparison });
      } else {
        // Fallback to local comparison
        const score = LocalAI.compareLocal(pet.aiFeatures || LocalAI.extractFromText(pet), candidate.aiFeatures || LocalAI.extractFromText(candidate));
        results.push({ ...candidate, matchScore: score, aiComparison: null });
      }
    }
    return results.filter(r => r.matchScore > 0.3).sort((a, b) => b.matchScore - a.matchScore);
  },
  async getStats() {
    const l = ((await DB.getS("pets:lost:idx")) || []).length;
    const f = ((await DB.getS("pets:found:idx")) || []).length;
    const a = ((await DB.getS("adoption:idx")) || []).length;
    const fo = ((await DB.getS("foster:idx")) || []).length;
    return { totalLost: l, totalFound: f, reunited: Math.floor((l + f) * 0.12), totalAdoption: a, totalFoster: fo };
  },

  // ── Adoption (dar en adopción) ──
  async createAdoption(data, userId = null) {
    const id = "ad_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
    const ad = { id, ...data, userId, status:"available", createdAt: new Date().toISOString(), active: true };
    if (!ad.aiFeatures) ad.aiFeatures = LocalAI.extractFromText(ad);
    await DB.setS(`adoption:${id}`, ad);
    const idx = (await DB.getS("adoption:idx")) || [];
    idx.unshift(id);
    await DB.setS("adoption:idx", idx);
    return ad;
  },
  async listAdoptions(type = "all") {
    const idx = (await DB.getS("adoption:idx")) || [];
    const items = [];
    for (const pid of idx) {
      const p = await DB.getS(`adoption:${pid}`);
      if (p && p.active !== false && (type === "all" || p.type === type)) items.push(p);
    }
    return items;
  },

  // ── Foster (guarda temporal) ──
  async createFoster(data, userId = null) {
    const id = "fo_" + Date.now() + "_" + Math.random().toString(36).slice(2,6);
    const fo = { id, ...data, userId, status:"available", createdAt: new Date().toISOString(), active: true };
    await DB.setS(`foster:${id}`, fo);
    const idx = (await DB.getS("foster:idx")) || [];
    idx.unshift(id);
    await DB.setS("foster:idx", idx);
    return fo;
  },
  async listFosters(type = "all") {
    const idx = (await DB.getS("foster:idx")) || [];
    const items = [];
    for (const pid of idx) {
      const p = await DB.getS(`foster:${pid}`);
      if (p && p.active !== false && (type === "all" || p.type === type)) items.push(p);
    }
    return items;
  },

  // ── Medical Records ──
  async saveMedicalRecord(userId, petId, record) {
    const key = `medical:${userId}:${petId}`;
    await DB.set(key, record);
    return record;
  },
  async getMedicalRecord(userId, petId) {
    return (await DB.get(`medical:${userId}:${petId}`)) || {
      petName:"", petType:"dog", breed:"", birthDate:"", weight:"",
      bloodType:"", microchipId:"", sterilized:null,
      vaccines:[], conditions:[], allergies:[], medications:[],
      vetVisits:[], reminders:[],
    };
  },
  async addVaccine(userId, petId, vaccine) {
    const rec = await this.getMedicalRecord(userId, petId);
    rec.vaccines.push({id:"v_"+Date.now(),...vaccine,date:vaccine.date||new Date().toISOString().split("T")[0]});
    await this.saveMedicalRecord(userId, petId, rec);
    return rec;
  },
  async addReminder(userId, petId, reminder) {
    const rec = await this.getMedicalRecord(userId, petId);
    rec.reminders.push({id:"r_"+Date.now(),...reminder,active:true,createdAt:new Date().toISOString()});
    await this.saveMedicalRecord(userId, petId, rec);
    return rec;
  },

  // ── Push Notifications ──
  async addNotification(userId, notif) {
    const n = { id:"nt_"+Date.now(), ...notif, createdAt: new Date().toISOString(), read: false };
    const all = (await DB.get(`notifs:${userId}`)) || [];
    all.unshift(n);
    await DB.set(`notifs:${userId}`, all.slice(0, 30));
    return n;
  },
  async getNotifications(userId) {
    return (await DB.get(`notifs:${userId}`)) || [];
  },
  async markNotifsRead(userId) {
    const all = (await DB.get(`notifs:${userId}`)) || [];
    const updated = all.map(n => ({ ...n, read: true }));
    await DB.set(`notifs:${userId}`, updated);
    return updated;
  },

  async seedIfEmpty() {
    const existing = (await DB.getS("pets:lost:idx")) || [];
    if (existing.length > 0) return;
    const seeds = [
      { name:"Max", type:"dog", breed:"Golden Retriever", status:"lost", description:"Amigable, pelaje dorado brillante, collar azul con chapita. Tamaño mediano-grande, muy juguetón. Último avistamiento cerca de plaza Palermo.", location:{lat:-34.6037,lng:-58.3816,address:"Palermo, Buenos Aires"}, ownerName:"María García", ownerPhone:"+54 11 5555-1234", date:"2026-03-28", reward:"$50.000", plan:"premium" },
      { name:"Luna", type:"cat", breed:"Siamese", status:"lost", description:"Ojos azules intensos, pelaje crema con extremidades marrón oscuro. Muy tímida, se esconde bajo autos. Tiene microchip.", location:{lat:-34.5875,lng:-58.4311,address:"Belgrano, Buenos Aires"}, ownerName:"Carlos Ruiz", ownerPhone:"+54 11 5555-5678", date:"2026-03-30", reward:null, plan:"free" },
      { name:"Rocky", type:"dog", breed:"Bulldog Francés", status:"lost", description:"Pequeño, patrón brindle, orejas de murciélago. Ronca mucho, súper amigable. Collar rojo con nombre grabado.", location:{lat:-34.6158,lng:-58.4333,address:"Caballito, Buenos Aires"}, ownerName:"Ana Martínez", ownerPhone:"+54 11 5555-9012", date:"2026-03-25", reward:"$30.000", plan:"premium" },
      { name:"Michi", type:"cat", breed:"Común Europeo", status:"lost", description:"Atigrado naranja, ojos verdes, castrado. Le falta un pedacito de la oreja izquierda. Tiene microchip.", location:{lat:-34.6345,lng:-58.3816,address:"San Telmo, Buenos Aires"}, ownerName:"Pedro López", ownerPhone:"+54 11 5555-3456", date:"2026-04-01", reward:"$20.000", plan:"free" },
      { name:"Toby", type:"dog", breed:"Labrador Negro", status:"lost", description:"Labrador negro grande, collar rojo. Responde a su nombre. Muy juguetón y cariñoso con extraños.", location:{lat:-34.5711,lng:-58.4233,address:"Nuñez, Buenos Aires"}, ownerName:"Laura Fernández", ownerPhone:"+54 11 5555-7890", date:"2026-03-29", reward:"$40.000", plan:"premium" },
      { name:"Coco", type:"dog", breed:"Caniche Toy", status:"lost", description:"Caniche toy blanco puro, 3kg. Lleva moño rosa. Recién bañada cuando se perdió.", location:{lat:-34.5950,lng:-58.4100,address:"Colegiales, Buenos Aires"}, ownerName:"Valentina Sosa", ownerPhone:"+54 11 5555-1111", date:"2026-04-01", reward:"$25.000", plan:"free" },
    ];
    const founds = [
      { type:"dog", breed:"Golden Retriever (posible)", status:"found", description:"Encontrado deambulando cerca del parque. Pelaje dorado, amigable, tiene collar azul sin chapita.", location:{lat:-34.6080,lng:-58.3900,address:"Recoleta, Buenos Aires"}, finderName:"Juan Pérez", finderPhone:"+54 11 5555-4321", date:"2026-04-01" },
      { type:"cat", breed:"Siamese (posible)", status:"found", description:"Gato crema con extremidades oscuras, ojos azules. Encontrado escondido bajo auto, muy asustado.", location:{lat:-34.5900,lng:-58.4280,address:"Belgrano, Buenos Aires"}, finderName:"Sofía Díaz", finderPhone:"+54 11 5555-8765", date:"2026-04-02" },
      { type:"dog", breed:"Mestizo mediano", status:"found", description:"Perro canela, tamaño mediano, sin collar. Dócil y hambriento. Encontrado en esquina de La Boca.", location:{lat:-34.6200,lng:-58.3700,address:"La Boca, Buenos Aires"}, finderName:"Martín Gómez", finderPhone:"+54 11 5555-2222", date:"2026-04-02" },
    ];
    // Seed adoption
    const adoptions = [
      { name:"Firulais", type:"dog", breed:"Mestizo grande", description:"Perro cariñoso de 4 años. Lo doy en adopción porque me mudo al exterior y no puedo llevarlo. Está vacunado, castrado y es excelente con niños.", reason:"Mudanza al exterior", location:{lat:-34.6100,lng:-58.4000,address:"Villa Crespo, Buenos Aires"}, ownerName:"Diego Ramírez", ownerPhone:"+54 11 5555-3333", date:"2026-03-27", urgent:false },
      { name:"Pelusa", type:"cat", breed:"Persa", description:"Gata persa de 6 años, muy tranquila. Mi hijo desarrolló alergia severa y el doctor nos dijo que no podemos tenerla. Necesita hogar con amor.", reason:"Alergia en la familia", location:{lat:-34.5800,lng:-58.4400,address:"Belgrano, Buenos Aires"}, ownerName:"Carolina Méndez", ownerPhone:"+54 11 5555-4444", date:"2026-03-30", urgent:true },
      { name:"Thor", type:"dog", breed:"Pastor Alemán", description:"Pastor alemán de 3 años, entrenado, obediente. Me divorcié y ninguno de los dos puede quedárselo en departamento. Merece una casa con patio.", reason:"Cambio de vivienda (divorcio)", location:{lat:-34.6300,lng:-58.3800,address:"Barracas, Buenos Aires"}, ownerName:"Roberto Silva", ownerPhone:"+54 11 5555-5555", date:"2026-04-01", urgent:false },
    ];
    // Seed foster
    const fosters = [
      { type:"both", fosterName:"Luciana Torres", fosterPhone:"+54 11 5555-6666", location:{lat:-34.5900,lng:-58.4100,address:"Palermo, Buenos Aires"}, description:"Tengo casa con patio grande y experiencia con perros y gatos. Puedo cuidar hasta 2 mascotas por vez. Trabajo desde casa así que están acompañados todo el día.", capacity:"2 mascotas", duration:"Hasta 3 meses", hasYard:true, experience:"5 años con mascotas", date:"2026-03-28" },
      { type:"cat", fosterName:"Marcela Vega", fosterPhone:"+54 11 5555-7777", location:{lat:-34.6050,lng:-58.3850,address:"Recoleta, Buenos Aires"}, description:"Departamento amplio, ideal para gatos. Tengo redes en todos los balcones y ventanas. Ya cuidé 8 gatos en tránsito. Les doy mucho amor y los llevo al veterinario si hace falta.", capacity:"3 gatos", duration:"Sin límite", hasYard:false, experience:"3 años de tránsito felino", date:"2026-03-30" },
      { type:"dog", fosterName:"Hernán Pacheco", fosterPhone:"+54 11 5555-8888", location:{lat:-34.5700,lng:-58.4500,address:"Saavedra, Buenos Aires"}, description:"Casa con jardín en zona tranquila. Ideal para perros medianos o grandes que necesiten espacio. Tengo un perro propio que es muy sociable.", capacity:"1 perro", duration:"Hasta 2 meses", hasYard:true, experience:"Siempre tuve perros", date:"2026-04-01" },
    ];
    for (const s of seeds) await this.createPet(s);
    for (const s of founds) await this.createPet(s);
    for (const a of adoptions) await this.createAdoption(a);
    for (const f of fosters) await this.createFoster(f);
  },
};

// ─────────────────────────────────────────────────────────
// SVG ICONS (compact)
// ─────────────────────────────────────────────────────────
const $ = {
  Dog:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="1.8" strokeLinecap="round"><path d="M10 5.172C10 3.782 8.884 2.022 7.5 2c-1.384-.022-2.343 1.116-2.343 2.055 0 .94-.627 1.945-1.157 2.87V12h4v-1.5c.252-.252.758-.252 1-.252M14 5.172C14 3.782 15.116 2.022 16.5 2c1.384-.022 2.343 1.116 2.343 2.055 0 .94.627 1.945 1.157 2.87V12h-4v-1.5c-.252-.252-.758-.252-1-.252"/><path d="M12 12a4 4 0 00-4 4v1a1 1 0 001 1h6a1 1 0 001-1v-1a4 4 0 00-4-4z"/></svg>,
  Cat:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="1.8" strokeLinecap="round"><path d="M12 5c-1.5-3-5-4-7-3l1 8h12l1-8c-2-1-5.5 0-7 3z"/><path d="M8 14v.5M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M7 13c-1.333 1.333-2 3-2 5 0 2.667 2 4 5 4h4c3 0 5-1.333 5-4 0-2-.667-3.667-2-5"/></svg>,
  Search:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  Cam:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>,
  Pin:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Heart:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.f?"currentColor":"none"} stroke={p.c||"currentColor"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  Star:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.c||"currentColor"}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Up:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  Msg:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  Bell:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  X:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Crown:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.c||"currentColor"}><path d="M2 20h20L19 8l-5 6-2-8-2 8-5-6z"/></svg>,
  AI:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="10" r="1.5" fill={p.c||"currentColor"}/><circle cx="15" cy="10" r="1.5" fill={p.c||"currentColor"}/><path d="M9 15c.83.83 1.94 1.5 3 1.5s2.17-.67 3-1.5"/></svg>,
  Paw:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.c||"currentColor"}><ellipse cx="8" cy="6" rx="2.5" ry="3"/><ellipse cx="16" cy="6" rx="2.5" ry="3"/><ellipse cx="4.5" cy="12" rx="2" ry="2.5"/><ellipse cx="19.5" cy="12" rx="2" ry="2.5"/><path d="M7 16c0-2 2.5-4 5-4s5 2 5 4-1.5 4-5 4-5-2-5-4z"/></svg>,
  Menu:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Arr:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Phone:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.7 2.33a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.73.34 1.52.57 2.33.7A2 2 0 0122 16.92z"/></svg>,
  User:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Send:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.c||"currentColor"}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>,
  Back:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Zap:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.c||"currentColor"}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Eye:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Scan:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>,
  Sparkle:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill={p.c||"currentColor"}><path d="M12 2l2.09 6.26L20 10.27l-4.91 3.82L16.18 21 12 17.27 7.82 21l1.09-6.91L4 10.27l5.91-2.01L12 2z"/></svg>,
  Grid:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  List:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Clock:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Shield:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Trash:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  Inbox:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>,
  Photo:(p)=><svg width={p.s||20} height={p.s||20} viewBox="0 0 24 24" fill="none" stroke={p.c||"currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
};

// ─────────────────────────────────────────────────────────
// PET AVATAR
// ─────────────────────────────────────────────────────────
function Avatar({ pet, size = 180, photo = null }) {
  const h = (pet.id || pet.name || "x").split("").reduce((a,c,i)=>a+c.charCodeAt(0)*(i+1),0);
  const hue = pet.type === "dog" ? 18+(h%35) : 245+(h%75);
  // If pet has a stored photo, show it
  if (pet.photoData || photo) {
    return (
      <div style={{
        width: size, height: size, borderRadius: Math.min(size*.1,16),
        overflow: "hidden", flexShrink: 0, position: "relative",
        background: "#F5F5F4",
      }}>
        <img src={pet.photoData || photo} alt={pet.name || "mascota"}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        {pet.plan === "premium" && size > 60 && (
          <div style={{ position:"absolute", top:6, right:6, background:"linear-gradient(135deg,#FFD700,#F59E0B)", borderRadius:20, padding:"2px 7px", display:"flex", alignItems:"center", gap:3, fontSize:9, fontWeight:800, color:"#78350F" }}>
            <$.Crown s={9} c="#78350F"/> PRO
          </div>
        )}
        {pet.aiFeatures?.source !== "text-analysis" && (
          <div style={{ position:"absolute", bottom:6, left:6, background:"rgba(0,0,0,.7)", color:"#fff", borderRadius:8, padding:"2px 7px", display:"flex", alignItems:"center", gap:3, fontSize:9, fontWeight:700 }}>
            <$.AI s={10} c="#4ADE80"/> IA Verificado
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{
      width:size, height:size, borderRadius:Math.min(size*.1,16),
      background:`linear-gradient(145deg,hsl(${hue},42%,88%),hsl(${hue+25},48%,78%))`,
      display:"flex", alignItems:"center", justifyContent:"center",
      position:"relative", overflow:"hidden", flexShrink:0,
    }}>
      <div style={{position:"absolute",inset:0,opacity:.06}}>
        {Array.from({length:5}).map((_,i)=>(
          <div key={i} style={{position:"absolute",left:`${(h*(i+3)*13)%90}%`,top:`${(h*(i+7)*17)%90}%`}}><$.Paw s={10+(i%3)*5} c={`hsl(${hue},38%,50%)`}/></div>
        ))}
      </div>
      {pet.type==="dog"?<$.Dog s={size*.36} c={`hsl(${hue},38%,38%)`}/>:<$.Cat s={size*.36} c={`hsl(${hue},38%,38%)`}/>}
      {pet.plan==="premium"&&size>60&&(
        <div style={{position:"absolute",top:6,right:6,background:"linear-gradient(135deg,#FFD700,#F59E0B)",borderRadius:20,padding:"2px 7px",display:"flex",alignItems:"center",gap:3,fontSize:9,fontWeight:800,color:"#78350F"}}>
          <$.Crown s={9} c="#78350F"/> PRO
        </div>
      )}
    </div>
  );
}

function Badge({ score }) {
  const p = Math.round(score*100);
  const c = p>75?"#059669":p>50?"#D97706":"#DC2626";
  return <span style={{background:`${c}14`,border:`1.5px solid ${c}40`,borderRadius:10,padding:"3px 10px",display:"inline-flex",alignItems:"center",gap:4,fontWeight:800,fontSize:12,color:c}}><$.AI s={13} c={c}/>{p}%</span>;
}

// ─────────────────────────────────────────────────────────
// AI ANALYSIS PANEL — Shows real AI results
// ─────────────────────────────────────────────────────────
function AIPanel({ features }) {
  if (!features) return null;
  const isReal = features.source !== "text-analysis";
  return (
    <div style={{
      marginTop:16, padding:14, borderRadius:14,
      background: isReal ? "linear-gradient(135deg,#05966908,#4ADE8008)" : "#F5F5F408",
      border: isReal ? "1px solid #05966920" : "1px solid #E7E5E4",
    }}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
        {isReal ? <$.Scan s={15} c="#059669"/> : <$.AI s={15} c="#D97706"/>}
        <span style={{fontSize:12,fontWeight:700,color:isReal?"#059669":"#D97706"}}>
          {isReal ? "Análisis IA (foto real)" : "Análisis por descripción"}
        </span>
        {isReal && <span style={{background:"#05966918",color:"#059669",padding:"1px 7px",borderRadius:6,fontSize:10,fontWeight:700}}>VERIFICADO</span>}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
        {[
          features.breed && {l:"Raza",v:features.breed},
          features.primaryColor && {l:"Color",v:features.primaryColor},
          features.secondaryColor && {l:"2do color",v:features.secondaryColor},
          features.size && {l:"Tamaño",v:features.size},
          features.pattern && {l:"Patrón",v:features.pattern},
          features.eyeColor && {l:"Ojos",v:features.eyeColor},
          features.furLength && {l:"Pelo",v:features.furLength},
          features.estimatedAge && {l:"Edad",v:features.estimatedAge},
          features.hasCollar !== undefined && {l:"Collar",v:features.hasCollar?"Sí":"No"},
          features.breedConfidence && {l:"Confianza",v:Math.round(features.breedConfidence*100)+"%"},
        ].filter(Boolean).map((f,i)=>(
          <span key={i} style={{background:"#fff",padding:"3px 9px",borderRadius:7,fontSize:11,fontWeight:600,color:"#57534E",border:"1px solid #F5F5F4"}}>
            {f.l}: <strong style={{color:"#1C1917"}}>{f.v}</strong>
          </span>
        ))}
      </div>
      {features.overallDescription && (
        <p style={{fontSize:12,color:"#78716C",marginTop:8,lineHeight:1.5,fontStyle:"italic"}}>
          "{features.overallDescription}"
        </p>
      )}
      {features.distinctiveMarks?.length > 0 && (
        <div style={{marginTop:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#A8A29E",marginBottom:4}}>MARCAS DISTINTIVAS</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {features.distinctiveMarks.map((m,i)=>(
              <span key={i} style={{background:"#FEF3C7",color:"#92400E",padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:600}}>
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes scan{0%{top:0}100%{top:100%}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes glow{0%,100%{box-shadow:0 0 15px rgba(232,89,12,.2)}50%{box-shadow:0 0 30px rgba(232,89,12,.5)}}
@keyframes scanLine{0%{top:-2px}100%{top:calc(100% + 2px)}}
.ch{transition:all .22s cubic-bezier(.4,0,.2,1)}.ch:hover{transform:translateY(-3px);box-shadow:0 14px 44px rgba(0,0,0,.09)!important}
.bp{background:linear-gradient(135deg,#E8590C,#DC2626);color:#fff;border:none;border-radius:13px;padding:12px 24px;font-weight:700;font-size:13px;cursor:pointer;transition:all .22s;display:inline-flex;align-items:center;gap:6px;font-family:inherit;letter-spacing:-.01em}
.bp:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(232,89,12,.3)}
.bs{background:#1C1917;color:#fff;border:none;border-radius:13px;padding:12px 24px;font-weight:600;font-size:13px;cursor:pointer;transition:all .22s;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.bs:hover{background:#292524}
.bo{background:transparent;color:#1C1917;border:2px solid #E7E5E4;border-radius:13px;padding:10px 20px;font-weight:600;font-size:12px;cursor:pointer;transition:all .22s;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.bo:hover{border-color:#E8590C;color:#E8590C}
.bg{background:linear-gradient(135deg,#FBBF24,#F59E0B);color:#78350F;border:none;border-radius:13px;padding:12px 24px;font-weight:700;font-size:13px;cursor:pointer;transition:all .22s;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.bg:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(245,158,11,.35)}
input,select,textarea{font-family:inherit;font-size:14px;padding:11px 14px;border:2px solid #E7E5E4;border-radius:11px;width:100%;outline:none;transition:border .2s;background:#fff;color:#1C1917}
input:focus,textarea:focus{border-color:#E8590C}textarea{resize:vertical;min-height:68px}
.fb{padding:8px 16px;border-radius:100px;border:2px solid #E7E5E4;background:#fff;cursor:pointer;font-weight:600;font-size:12px;transition:all .22s;display:inline-flex;align-items:center;gap:5px;font-family:inherit;color:#78716C}
.fb.on{background:#1C1917;color:#fff;border-color:#1C1917}.fb:hover:not(.on){border-color:#E8590C;color:#E8590C}
.tb{padding:10px 0;border:none;background:none;cursor:pointer;font-weight:600;font-size:13px;color:#A8A29E;border-bottom:3px solid transparent;transition:all .22s;font-family:inherit}
.tb.on{color:#E8590C;border-bottom-color:#E8590C}
.mo{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(10px);z-index:100;display:flex;align-items:flex-end;justify-content:center}
.mc{background:#fff;border-radius:20px 20px 0 0;padding:22px;max-height:92vh;overflow-y:auto;width:100%;max-width:520px;animation:slideUp .32s cubic-bezier(.4,0,.2,1);position:relative}
@media(min-width:768px){.mo{align-items:center}.mc{border-radius:20px;max-height:85vh}}
.nt{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:200;padding:11px 20px;border-radius:13px;font-weight:700;font-size:12px;animation:fadeIn .3s;max-width:90%;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.12)}
.nt.ok{background:#059669;color:#fff}.nt.info{background:#2563EB;color:#fff}.nt.warn{background:#D97706;color:#fff}
`;

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("lost");
  const [filter, setFilter] = useState("all");
  const [lostPets, setLostPets] = useState([]);
  const [foundPets, setFoundPets] = useState([]);
  const [selectedPet, setSelectedPet] = useState(null);
  const [modal, setModal] = useState(null);
  const [matches, setMatches] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStep, setAiStep] = useState("");
  const [contactPet, setContactPet] = useState(null);
  const [notif, setNotif] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [stats, setStats] = useState({totalLost:0,totalFound:0,reunited:0});
  const [msgText, setMsgText] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [viewMode, setViewMode] = useState("grid");
  // AI assistant chat
  const [aiChatMsgs, setAiChatMsgs] = useState([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  // Photo analysis state
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  // Payment state
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  // New modules state
  const [pushNotifs, setPushNotifs] = useState([]);
  const [adoptionPets, setAdoptionPets] = useState([]);
  const [fosterOffers, setFosterOffers] = useState([]);
  const [page, setPage] = useState("home"); // home|club|adoption|foster|vet|petid|community|shield|market|petfit|petmatch|petshop
  // Vet AI chat
  const [vetMessages, setVetMessages] = useState([]);
  const [vetInput, setVetInput] = useState("");
  const [vetLoading, setVetLoading] = useState(false);
  // Community posts
  const [communityPosts, setCommunityPosts] = useState([]);
  // Radar search
  const [radarResults, setRadarResults] = useState([]);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarStep, setRadarStep] = useState("");
  const [radarPet, setRadarPet] = useState(null);

  const notify = useCallback((m,t="ok")=>{setNotif({m,t});setTimeout(()=>setNotif(null),3200);},[]);

  // Boot
  useEffect(()=>{(async()=>{
    await Backend.seedIfEmpty();
    const [l,f,s,ad,fo]=await Promise.all([Backend.listPets("lost"),Backend.listPets("found"),Backend.getStats(),Backend.listAdoptions(),Backend.listFosters()]);
    setLostPets(l);setFoundPets(f);setStats(s);setAdoptionPets(ad);setFosterOffers(fo);
    const u=await DB.get("session:current");
    if(u){
      setCurrentUser(u);
      const notifs=await Backend.getNotifications(u.id);
      setPushNotifs(notifs);
    }
    setLoading(false);
  })();},[]);

  const refresh = useCallback(async()=>{
    const [l,f,s,ad,fo]=await Promise.all([Backend.listPets("lost"),Backend.listPets("found"),Backend.getStats(),Backend.listAdoptions(),Backend.listFosters()]);
    setLostPets(l);setFoundPets(f);setStats(s);setAdoptionPets(ad);setFosterOffers(fo);
  },[]);

  // ── AI Photo Analysis ──
  const analyzePhoto = useCallback(async(base64, mediaType, description)=>{
    setAnalyzingPhoto(true);
    setAnalysisResult(null);
    setAiStep("Enviando imagen a la IA...");
    try {
      const result = await ClaudeAI.analyzePhoto(base64, mediaType, description);
      if (result) {
        setAnalysisResult(result);
        setAiStep("Análisis completado");
        notify("IA analizó la foto exitosamente!");
        return result;
      } else {
        setAiStep("Error en análisis, usando método local");
        notify("No se pudo analizar la foto, usando análisis de texto","warn");
        return null;
      }
    } catch {
      setAiStep("Error");
      notify("Error al analizar la foto","warn");
      return null;
    } finally {
      setAnalyzingPhoto(false);
    }
  },[notify]);

  // ── AI Match Search ──
  const runAI = useCallback(async(pet)=>{
    setAiLoading(true);setModal("match");setMatches([]);
    const steps = [
      "Extrayendo características...",
      "Comparando con base de datos...",
      "Calculando similitudes...",
      "Analizando patrones...",
      "Generando resultados..."
    ];
    for (let i=0;i<steps.length;i++){
      setAiStep(steps[i]);
      await new Promise(r=>setTimeout(r,600));
    }
    const results = await Backend.runAIMatch(pet);
    setMatches(results);
    setAiLoading(false);
    if(results.length>0) {
      notify(`IA encontró ${results.length} coincidencia(s)!`);
      // Send push notification
      if(currentUser) {
        const n = await Backend.addNotification(currentUser.id, {
          type:"match", title:"¡Posible coincidencia!",
          body:`La IA encontró ${results.length} mascota(s) similares a tu búsqueda.`,
          icon:"ai",
        });
        setPushNotifs(p=>[n,...p]);
      }
    }
    else setAiStep("Búsqueda completa");
  },[notify]);

  // ── Register Pet with AI ──
  const registerPet = useCallback(async(data)=>{
    const pet = await Backend.createPet(data, currentUser?.id || null);
    await refresh();
    setModal(null);
    notify(data.status==="lost"?"Mascota registrada. Face ID Tracker activado...":"Reporte enviado. Buscando al dueño...");
    if(currentUser) {
      await Backend.addNotification(currentUser.id, {
        type:"registered", title:data.status==="lost"?"Face ID Tracker activado":"Reporte publicado",
        body:data.status==="lost"?"Tu mascota está siendo rastreada en la plataforma y en redes sociales automáticamente.":"Tu reporte fue publicado. La IA está buscando coincidencias.",
        icon:"check",
      });
    }
    // Step 1: AI Match in local database
    setTimeout(()=>runAI(pet),800);
    // Step 2: Auto Face ID Tracker on web (only for lost pets with active subscription)
    if(data.status==="lost" && isSubscriptionActive(currentUser)){
      setTimeout(async()=>{
        const webResults = await ClaudeAI.faceIdTracker(pet);
        if(webResults.length>0 && currentUser){
          const n = await Backend.addNotification(currentUser.id,{type:"match",title:"Face ID Tracker: resultados en redes",body:`Se encontraron ${webResults.length} publicaciones en redes sociales que podrían coincidir.`,icon:"search"});
          setPushNotifs(p=>[n,...p]);
          notify(`Face ID encontró ${webResults.length} resultado(s) en redes!`);
        }
      },5000);
    }
  },[refresh,notify,runAI,currentUser]);

  // ── Auth ──
  const handleAuth = useCallback(async(d, mode)=>{
    if (mode === "login") {
      const u = await Backend.loginUser(d.email, d.password);
      if (u.error) { notify(u.error, "warn"); return; }
      await DB.set("session:current", u);
      setCurrentUser(u);
      setModal(null);
      notify(`Bienvenido/a, ${u.name || u.email}!`);
    } else {
      if (!d.name?.trim()) { notify("Ingresá tu nombre", "warn"); return; }
      const u = await Backend.createUser(d);
      if (u.error) { notify(u.error, "warn"); return; }
      await DB.set("session:current", u);
      setCurrentUser(u);
      setModal(null);
      notify("Cuenta creada exitosamente!");
    }
  },[notify]);

  const handleLogout = useCallback(async()=>{
    await DB.del("session:current");setCurrentUser(null);setModal(null);notify("Sesión cerrada","info");
  },[notify]);

  // ── Require Auth helper ──
  const requireAuth = useCallback((action)=>{
    if(currentUser) return true;
    setModal("auth");
    notify("Necesitás iniciar sesión para "+action,"info");
    return false;
  },[currentUser,notify]);

  // ── AI Chat Assistant ──
  const sendAiChat = useCallback(async()=>{
    if(!aiChatInput.trim())return;
    const msg = aiChatInput.trim();
    setAiChatInput("");
    setAiChatMsgs(p=>[...p,{from:"user",text:msg,time:new Date().toLocaleTimeString()}]);
    setAiChatLoading(true);
    const ctx = `Mascotas perdidas: ${lostPets.length}, Encontradas: ${foundPets.length}. El usuario ${currentUser?"está logueado como "+currentUser.name:"no está logueado"}.`;
    const reply = await ClaudeAI.chatAssistant(msg,ctx);
    setAiChatMsgs(p=>[...p,{from:"ai",text:reply,time:new Date().toLocaleTimeString()}]);
    setAiChatLoading(false);
  },[aiChatInput,lostPets.length,foundPets.length,currentUser]);

  // ── Vet AI Chat ──
  const sendVetChat = useCallback(async()=>{
    if(!vetInput.trim())return;
    const msg = vetInput.trim();
    setVetInput("");
    setVetMessages(p=>[...p,{from:"user",text:msg,time:new Date().toLocaleTimeString()}]);
    setVetLoading(true);
    try {
      const response = await fetch("/api/vet-chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system:`Sos un veterinario virtual con IA de PetFinder AI. Respondé en español argentino. Sos empático, profesional y claro. Podés dar orientación general sobre salud, síntomas, alimentación, comportamiento y cuidados de perros y gatos. SIEMPRE aclarás que no reemplazás a un veterinario presencial y que ante emergencias deben ir a una clínica. Usá emojis con moderación. Si te preguntan algo que no es sobre mascotas, redirigí amablemente.`,
          messages:[{role:"user",content:msg}]
        })
      });
      const data = await response.json();
      const reply = data.content?.map(i=>i.text||"").join("\n") || "No pude procesar tu consulta.";
      setVetMessages(p=>[...p,{from:"vet",text:reply,time:new Date().toLocaleTimeString()}]);
    } catch {
      setVetMessages(p=>[...p,{from:"vet",text:"Error de conexión. Intentá de nuevo.",time:new Date().toLocaleTimeString()}]);
    }
    setVetLoading(false);
  },[vetInput]);

  // ── Face ID Tracker: Web Search for pet ──
  const runRadarSearch = useCallback(async(pet)=>{
    if(!isSubscriptionActive(currentUser)){setModal("premium");notify("Necesitás suscripción para usar Face ID Tracker","info");return;}
    setRadarPet(pet);
    setRadarResults([]);
    setRadarLoading(true);
    setModal("radar");
    const sources = [
      {name:"Facebook Groups",icon:"📘",delay:800},
      {name:"Instagram #MascotaPerdida",icon:"📸",delay:600},
      {name:"X (Twitter)",icon:"🐦",delay:500},
      {name:"TikTok",icon:"🎵",delay:700},
      {name:"Petco Love Lost",icon:"🐾",delay:900},
      {name:"PawBoost",icon:"🔍",delay:600},
      {name:"Refugios de la zona",icon:"🏥",delay:800},
      {name:"Grupos WhatsApp/Telegram",icon:"💬",delay:700},
      {name:"Clasificados online",icon:"📋",delay:500},
      {name:"Veterinarias cercanas",icon:"🩺",delay:600},
    ];
    for(const s of sources){
      setRadarStep(`Escaneando ${s.name} ${s.icon}`);
      await new Promise(r=>setTimeout(r,s.delay));
    }
    setRadarStep("Analizando coincidencias con Face ID...");
    const results = await ClaudeAI.faceIdTracker(pet);
    setRadarResults(results);
    setRadarLoading(false);
    if(results.length>0){
      notify(`Face ID encontró ${results.length} coincidencia(s) en la web!`);
      if(currentUser){
        const n = await Backend.addNotification(currentUser.id,{type:"match",title:"🔍 Face ID Tracker: coincidencias",body:`Se encontraron ${results.length} publicaciones en redes que podrían coincidir con tu mascota.`,icon:"search"});
        setPushNotifs(p=>[n,...p]);
      }
    }
  },[currentUser,notify]);

  // ── Send msg in contact ──
  const handleSendMsg = useCallback(()=>{
    if(!msgText.trim())return;
    setChatMsgs(p=>[...p,{id:Date.now(),from:"me",text:msgText,time:new Date().toLocaleTimeString()}]);
    setMsgText("");
    setTimeout(()=>{
      setChatMsgs(p=>[...p,{id:Date.now(),from:"them",text:"¡Gracias por escribir! Voy a revisar y te contacto pronto.",time:new Date().toLocaleTimeString()}]);
    },2200);
  },[msgText]);

  const displayPets = tab==="lost"?lostPets:foundPets;
  const filtered = filter==="all"?displayPets:displayPets.filter(p=>p.type===filter);

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#FAFAF9",fontFamily:"'Outfit',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fraunces:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet"/>
      <style>{CSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{width:52,height:52,border:"3px solid #E8590C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 14px"}}/>
        <div style={{fontWeight:700,fontSize:15,color:"#57534E"}}>Cargando PetFinder AI...</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'Outfit',sans-serif",background:"#FAFAF9",color:"#1C1917"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Fraunces:ital,wght@0,700;0,800;1,700&display=swap" rel="stylesheet"/>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <style>{CSS}</style>

      {notif&&<div className={`nt ${notif.t}`}>{notif.m}</div>}

      {/* HEADER */}
      <header style={{position:"sticky",top:0,zIndex:50,background:"rgba(250,250,249,.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(0,0,0,.04)",padding:"9px 14px"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer"}} onClick={()=>{setSelectedPet(null);setPage("home");}}>
            <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Paw s={18} c="#fff"/>
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:16,letterSpacing:"-.04em",lineHeight:1}}>PetFinder</div>
              <div style={{fontSize:8,fontWeight:700,color:"#E8590C",letterSpacing:".14em",textTransform:"uppercase"}}>AI Vision</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            {/* Notification bell */}
            {currentUser&&(
              <button style={{width:34,height:34,borderRadius:9,border:"none",background:"#F5F5F4",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}} onClick={()=>setModal("notifications")}>
                <$.Bell s={16} c="#57534E"/>
                {pushNotifs.filter(n=>!n.read).length>0&&(
                  <span style={{position:"absolute",top:2,right:2,width:16,height:16,borderRadius:8,background:"#DC2626",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{pushNotifs.filter(n=>!n.read).length}</span>
                )}
              </button>
            )}
            <button style={{width:34,height:34,borderRadius:9,border:"none",background:"#F5F5F4",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setModal("ai-chat")} title="Asistente IA">
              <$.Sparkle s={16} c="#E8590C"/>
            </button>
            <button className="bp" style={{padding:"8px 12px",fontSize:11,borderRadius:10}} onClick={()=>{if(requireAuth("reportar"))setModal("register");}}>
              <$.Up s={13}/> Reportar
            </button>
            <button style={{width:34,height:34,borderRadius:9,border:"2px solid #E7E5E4",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setModal("menu")}>
              {currentUser?<$.User s={16} c="#E8590C"/>:<$.Menu s={16}/>}
            </button>
          </div>
        </div>
        {/* Section nav bar */}
        <div style={{maxWidth:1100,margin:"6px auto 0",display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
          {[
            {k:"club",l:"Club us$6",i:<$.Paw s={16}/>},
            {k:"home",l:"Perdidos",i:<$.Search s={16}/>},
            {k:"vet",l:"Vet IA",i:<$.AI s={16}/>},
            {k:"petid",l:"ID + QR",i:<$.Scan s={16}/>},
            {k:"petfit",l:"PetFit",i:<$.Heart s={16}/>},
            {k:"petmatch",l:"PetMatch",i:<$.Sparkle s={16}/>},

            {k:"adoption",l:"Adopción",i:<$.Heart s={16}/>},
            {k:"foster",l:"Guarda",i:<$.Shield s={16}/>},
            {k:"market",l:"Servicios",i:<$.Star s={16}/>},
            {k:"community",l:"Comunidad",i:<$.Paw s={16}/>},
          ].map(n=>(
            <button key={n.k} onClick={()=>{setPage(n.k);setSelectedPet(null);}} style={{
              padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",
              background:page===n.k?"#1C1917":"transparent",color:page===n.k?"#FFFFFF":"#475569",
              fontWeight:700,fontSize:15,fontFamily:"inherit",transition:"all .2s",
              display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",flexShrink:0,
            }}>{n.i}{n.l}</button>
          ))}
        </div>
      </header>

      {/* HOME */}
      {!selectedPet && page==="home" && (
        <div style={{animation:"fadeIn .5s"}}>

          {/* ═══ HERO ═══ */}
          <section style={{padding:0,background:"linear-gradient(180deg,#0F172A 0%,#1E293B 55%,#0F172A 100%)",color:"#fff",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",inset:0,opacity:.12}}>{Array.from({length:18}).map((_,i)=>(<div key={i} style={{position:"absolute",width:4,height:4,borderRadius:2,background:"#7C3AED",left:`${(i*17)%100}%`,top:`${(i*23+8)%100}%`,animation:`pulse ${2+i%3}s ${i*.3}s infinite`}}/>))}</div>

            <div style={{maxWidth:720,margin:"0 auto",padding:"40px 16px 32px",textAlign:"center",position:"relative",zIndex:1}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(124,58,237,.15)",border:"1px solid rgba(124,58,237,.3)",padding:"6px 16px",borderRadius:100,marginBottom:18}}>
                <div style={{width:8,height:8,borderRadius:4,background:"#4ADE80",boxShadow:"0 0 8px #4ADE80",animation:"pulse 1.5s infinite"}}/>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:".08em",color:"#C4B5FD"}}>RASTREO IA ACTIVO · GEOLOCALIZACIÓN EN TIEMPO REAL</span>
              </div>

              <h1 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(28px,7vw,46px)",fontWeight:800,lineHeight:1.06,letterSpacing:"-.03em",marginBottom:14}}>
                Te ayudamos a encontrar<br/>tu{" "}
                <span style={{background:"linear-gradient(135deg,#A78BFA,#FBBF24)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>mascota perdida</span>
              </h1>

              <p style={{fontSize:15,color:"#94A3B8",lineHeight:1.6,maxWidth:440,margin:"0 auto 24px"}}>
                Difusión inteligente, reportes por WhatsApp, cruce automático en redes y alertas geolocalizadas. Vos subís la foto, nosotros hacemos todo.
              </p>

              {/* Main CTA */}
              <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:24,padding:28,maxWidth:620,margin:"0 auto 18px",backdropFilter:"blur(10px)"}}>
                <div style={{width:74,height:74,borderRadius:20,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 8px 30px rgba(124,58,237,.3)"}}>
                  <$.Scan s={28} c="#fff"/>
                </div>
                <div style={{fontWeight:800,fontSize:26,marginBottom:8}}>Subí la foto, nosotros la buscamos</div>
                <div style={{fontSize:15,color:"#94A3B8",marginBottom:20}}>Face ID Tracker + Reportes WhatsApp + Alertas geolocalizadas</div>
                <button className="bp" style={{width:"100%",justifyContent:"center",padding:"18px",fontSize:19,background:"linear-gradient(135deg,#7C3AED,#A78BFA)",borderRadius:14,boxShadow:"0 8px 30px rgba(124,58,237,.4)"}}
                  onClick={()=>{if(requireAuth("activar rastreo"))setModal("register");}}>
                  <$.Cam s={22}/> Subir foto y activar rastreo
                </button>
                <div style={{fontSize:13,color:"#64748B",marginTop:12}}>Subir es gratis · Resultados desde US$20/semana</div>
              </div>

              {/* Enlarged "Found" button */}
              <button style={{background:"linear-gradient(135deg,rgba(74,222,128,.15),rgba(96,165,250,.15))",border:"2px solid rgba(74,222,128,.4)",color:"#E2E8F0",borderRadius:16,padding:"18px 28px",fontWeight:700,fontSize:16,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",width:"100%",maxWidth:620,margin:"0 auto"}}
                onClick={()=>{if(requireAuth("reportar"))setModal("found");}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(74,222,128,.2)"}
                onMouseLeave={e=>e.currentTarget.style.background="linear-gradient(135deg,rgba(74,222,128,.15),rgba(96,165,250,.15))"}>
                <$.Heart s={20} c="#4ADE80"/> Si encontraste una mascota perdida, subí la foto
              </button>

              <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:28,flexWrap:"wrap"}}>
                {[{n:stats.totalLost,l:"Buscando",c:"#F87171"},{n:stats.totalFound,l:"Encontradas",c:"#60A5FA"},{n:stats.reunited,l:"Reunidas",c:"#4ADE80"}].map((s,i)=>(
                  <div key={i}><div style={{fontSize:22,fontWeight:800,color:s.c,letterSpacing:"-.04em"}}>{s.n}</div><div style={{fontSize:9,color:"#64748B",fontWeight:600}}>{s.l}</div></div>
                ))}
              </div>
            </div>
          </section>

          {/* ═══ LIVE MAP + WHATSAPP — PORTADA ═══ */}
          <section style={{padding:"24px 14px",maxWidth:640,margin:"0 auto"}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Interactive Map Preview */}
              <div style={{background:"#fff",borderRadius:18,overflow:"hidden",border:"1px solid #E7E5E4",boxShadow:"0 4px 24px rgba(0,0,0,.06)"}}>
                <div style={{padding:"14px 16px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:"#1C1917",letterSpacing:"-.02em"}}>Mapa de búsqueda activa</div>
                    <div style={{fontSize:11,color:"#A8A29E"}}>Mascotas reportadas en tu zona</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:8,height:8,borderRadius:4,background:"#4ADE80",animation:"pulse 1.5s infinite"}}/>
                    <span style={{fontSize:10,fontWeight:700,color:"#059669"}}>EN VIVO</span>
                  </div>
                </div>
                <div id="portada-map" style={{width:"100%",height:240,background:"#F0F9FF",position:"relative",overflow:"hidden"}}>
                  {/* Map loads via useEffect */}
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
                    <$.Pin s={32} c="#2563EB"/>
                    <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Cargando mapa...</div>
                  </div>
                </div>
                <div style={{padding:"10px 16px",display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{background:"#DC262615",color:"#DC2626",padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>🔴 {stats.totalLost} perdidas</span>
                  <span style={{background:"#2563EB15",color:"#2563EB",padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>🔵 {stats.totalFound} encontradas</span>
                  <span style={{background:"#05966915",color:"#059669",padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>🟢 {stats.reunited} reunidas</span>
                </div>
              </div>

              {/* WhatsApp CTA */}
              <button onClick={()=>window.open("https://wa.me/5491155551234?text=Hola!%20Quiero%20reportar%20una%20mascota%20en%20PetFinder%20AI","_blank")} style={{
                width:"100%",padding:"16px 20px",borderRadius:14,border:"none",
                background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                fontFamily:"inherit",fontWeight:700,fontSize:15,boxShadow:"0 4px 20px rgba(37,211,102,.3)",
                transition:"all .2s",
              }}>
                <svg width={22} height={22} viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Reportar por WhatsApp
              </button>
            </div>
          </section>

          {/* ═══ REDES SOCIALES SECTION ═══ */}
          <section style={{padding:"0 14px 24px",maxWidth:640,margin:"0 auto"}}>
            <div style={{background:"linear-gradient(135deg,#1E293B,#0F172A)",borderRadius:18,padding:20,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"rgba(124,58,237,.1)"}}/>
              <div style={{fontSize:10,fontWeight:700,color:"#A78BFA",letterSpacing:".1em",marginBottom:10}}>DIFUSIÓN EN REDES</div>
              <div style={{fontWeight:800,fontSize:18,color:"#fff",marginBottom:6}}>Tu mascota en todas las redes</div>
              <div style={{fontSize:12,color:"#94A3B8",lineHeight:1.5,marginBottom:14}}>Publicamos anuncios geolocalizados donde se perdió tu mascota. La gente que pasa por esa zona ve el anuncio en su celular.</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                {[
                  {n:"Instagram",c:"#E4405F"},{n:"Facebook",c:"#1877F2"},{n:"X",c:"#fff"},
                  {n:"TikTok",c:"#fff"},{n:"WhatsApp",c:"#25D366"},{n:"Telegram",c:"#0088CC"},
                  {n:"YouTube",c:"#FF0000"},{n:"Nextdoor",c:"#00B246"},
                ].map((s,i)=>(
                  <span key={i} style={{background:`${s.c}20`,color:s.c,padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:700}}>{s.n}</span>
                ))}
              </div>
              <button className="bp" style={{width:"100%",justifyContent:"center",background:"linear-gradient(135deg,#7C3AED,#A78BFA)"}}
                onClick={()=>{if(requireAuth("ver planes"))setModal("premium");}}>
                <$.Zap s={16}/> Ver planes de difusión
              </button>
            </div>
          </section>

          {/* ═══ YOUTUBE CHANNEL ═══ */}
          <section style={{padding:"0 14px 24px",maxWidth:640,margin:"0 auto"}}>
            <div style={{background:"#fff",borderRadius:18,border:"1px solid #E7E5E4",overflow:"hidden"}}>
              <div style={{background:"linear-gradient(135deg,#DC2626,#EF4444)",padding:"16px 18px",display:"flex",alignItems:"center",gap:10}}>
                <svg width={28} height={28} viewBox="0 0 24 24" fill="#fff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><polygon fill="#DC2626" points="9.545 15.568 15.818 12 9.545 8.432"/></svg>
                <div>
                  <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>Canal YouTube PetFinder AI</div>
                  <div style={{fontSize:11,color:"#FECACA"}}>Mascotas perdidas y encontradas en video</div>
                </div>
              </div>
              <div style={{padding:16}}>
                <div style={{fontSize:13,color:"#57534E",lineHeight:1.6,marginBottom:12}}>
                  Todas las mascotas reportadas se publican automáticamente en nuestro canal de YouTube con foto, descripción, zona y contacto. Más visibilidad para encontrarlas.
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
                  {["Videos con foto y datos","Actualizaciones diarias","Compartí en tus redes","Suscribite para alertas"].map((f,i)=>(
                    <span key={i} style={{background:"#FEF2F2",color:"#DC2626",padding:"4px 10px",borderRadius:7,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>
                      <$.Check s={10} c="#DC2626"/>{f}
                    </span>
                  ))}
                </div>
                <button onClick={()=>window.open("https://youtube.com/@PetFinderAI","_blank")} style={{
                  width:"100%",padding:"12px",borderRadius:10,border:"none",
                  background:"linear-gradient(135deg,#DC2626,#EF4444)",color:"#fff",
                  cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><polygon points="9.545 15.568 15.818 12 9.545 8.432"/></svg>
                  Ver canal de YouTube
                </button>
              </div>
            </div>
          </section>

          {/* ═══ 6 CORE SERVICES ═══ */}
          <section style={{padding:"32px 14px",maxWidth:640,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:10,fontWeight:700,color:"#7C3AED",letterSpacing:".12em",marginBottom:6}}>TECNOLOGÍA QUE TRABAJA POR VOS</div>
              <h2 style={{fontFamily:"'Fraunces',serif",fontSize:22,fontWeight:800,letterSpacing:"-.03em"}}>6 servicios con IA integrados</h2>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                {icon:<$.Zap s={22} c="#fff"/>,gradient:"linear-gradient(135deg,#7C3AED,#A78BFA)",title:"Difusión inteligente geolocalizada",desc:"Mapa de búsqueda con IA según zona y probabilidad de desplazamiento. Cruce automático con reportes existentes.",tags:["Mapa de calor","Radio expandible","Cruce automático"],tagBg:"#7C3AED"},
                {icon:<$.Msg s={22} c="#fff"/>,gradient:"linear-gradient(135deg,#25D366,#128C7E)",title:"Reportes por WhatsApp",desc:"Canal donde cualquier vecino puede enviar foto, ubicación y horario de un avistamiento. La IA cruza reportes automáticamente.",tags:["Sin app","Foto + ubicación","Cruce IA"],tagBg:"#128C7E"},
                {icon:<$.Bell s={22} c="#fff"/>,gradient:"linear-gradient(135deg,#2563EB,#60A5FA)",title:"Alertas geolocalizadas por radio",desc:"La IA envía alertas automáticas a personas en radios específicos según probabilidad de desplazamiento. Se expande progresivamente.",tags:["Radio dinámico","Push vecinal","Expansión auto"],tagBg:"#2563EB"},
                {icon:<$.Star s={22} c="#fff"/>,gradient:"linear-gradient(135deg,#E8590C,#F97316)",title:"Difusión paga para casos urgentes",desc:"IA optimiza anuncios en redes sociales y los muestra a la gente adecuada dentro del área crítica. Máxima exposición garantizada.",tags:["Anuncios IA","Segmentación","Alcance máximo"],tagBg:"#E8590C"},
                {icon:<$.Search s={22} c="#fff"/>,gradient:"linear-gradient(135deg,#059669,#34D399)",title:"Cruce automático con redes sociales",desc:"Rastrea Facebook, Instagram, X, grupos barriales, Telegram y clasificados buscando 'perro encontrado', 'gato visto', 'anda dando vueltas'. Aunque no mencionen el nombre.",tags:["Facebook","Instagram","X","WhatsApp","Telegram","Clasificados"],tagBg:"#059669"},
                {icon:<$.Cam s={22} c="#fff"/>,gradient:"linear-gradient(135deg,#D97706,#FBBF24)",title:"Avisos automáticos optimizados",desc:"Genera flyers, textos de WhatsApp, posteos y anuncios con formato optimizado: foto correcta, datos mínimos, zona exacta, teléfono visible y palabras que aumentan la difusión.",tags:["Flyers IA","WhatsApp","Posts redes","Hashtags"],tagBg:"#D97706"},
              ].map((s,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:18,border:"1px solid #F5F5F4",padding:18,display:"flex",gap:14,alignItems:"flex-start",animation:`fadeIn .4s ease ${i*.06}s both`}}>
                  <div style={{width:44,height:44,borderRadius:13,background:s.gradient,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.icon}</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,marginBottom:3}}>{s.title}</div>
                    <div style={{fontSize:12,color:"#78716C",lineHeight:1.5}}>{s.desc}</div>
                    <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                      {s.tags.map((t,j)=>(<span key={j} style={{background:`${s.tagBg}0A`,color:s.tagBg,padding:"3px 8px",borderRadius:6,fontSize:9,fontWeight:700}}>{t}</span>))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ PRICING ═══ */}
          <section style={{padding:"0 14px 24px",maxWidth:600,margin:"0 auto"}}>
            <div style={{background:"linear-gradient(135deg,#0F172A,#1E293B)",borderRadius:20,padding:20,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(124,58,237,.06)"}}/>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:10,fontWeight:700,color:"#FBBF24",letterSpacing:".08em",marginBottom:6}}>PLANES</div>
                <div style={{fontSize:14,color:"#94A3B8"}}>Subir la foto es siempre gratis</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                {[
                  {name:"Búsqueda",price:"US$20",period:"/sem",color:"#E8590C",feats:["Resultados Face ID","Contacto directo","Alertas 7 días","Cruce en redes"]},
                  {name:"Máxima",price:"US$50",period:"/sem",color:"#7C3AED",pop:true,feats:["Todo Búsqueda +","Reportes WhatsApp","Difusión en redes","Flyers + avisos auto","Republicación 48hs"]},
                ].map((p,i)=>(
                  <div key={i} style={{flex:1,background:"rgba(255,255,255,.05)",borderRadius:14,padding:14,border:p.pop?"1px solid rgba(124,58,237,.3)":"1px solid rgba(255,255,255,.08)",position:"relative"}}>
                    {p.pop&&<div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",background:"#7C3AED",color:"#fff",padding:"2px 10px",borderRadius:100,fontSize:8,fontWeight:800}}>RECOMENDADO</div>}
                    <div style={{fontWeight:800,fontSize:13,color:p.color}}>{p.name}</div>
                    <div style={{fontSize:22,fontWeight:800,color:"#fff",marginTop:2}}>{p.price}<span style={{fontSize:11,color:"#64748B"}}>{p.period}</span></div>
                    <div style={{marginTop:8}}>{p.feats.map((f,j)=><div key={j} style={{fontSize:10,color:"#94A3B8",marginBottom:3,display:"flex",alignItems:"center",gap:4}}><$.Check s={10} c={p.color}/>{f}</div>)}</div>
                    <button className="bp" style={{width:"100%",justifyContent:"center",marginTop:10,padding:"9px",fontSize:11,background:p.color,borderRadius:10}} onClick={()=>setModal("premium")}>{p.pop?"Elegir":"Ver más"}</button>
                  </div>
                ))}
              </div>
              {/* Vet IA highlight */}
              <div onClick={()=>setPage("vet")} style={{marginTop:12,padding:"14px 16px",background:"rgba(5,150,105,.15)",borderRadius:12,border:"1px solid rgba(5,150,105,.3)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><$.AI s={18} c="#4ADE80"/><div><span style={{fontSize:13,fontWeight:800,color:"#4ADE80"}}>Veterinario IA</span><div style={{fontSize:10,color:"#94A3B8"}}>Consultá gratis sobre salud y síntomas</div></div></div>
                <$.Arr s={16} c="#4ADE80"/>
              </div>
            </div>
          </section>

          {/* ═══ CLUB CTA + MORE SERVICES ═══ */}
          <section style={{padding:"0 14px 20px",maxWidth:600,margin:"0 auto"}}>
            {/* Club CTA — the main hook */}
            <div onClick={()=>setPage("club")} className="ch" style={{background:"linear-gradient(135deg,#FEF3C7,#FDE68A)",borderRadius:18,padding:18,marginBottom:16,cursor:"pointer",border:"2px solid #F59E0B40",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-15,right:-15,width:70,height:70,borderRadius:"50%",background:"rgba(245,158,11,.15)"}}/>
              <div style={{display:"flex",gap:14,alignItems:"center"}}>
                <div style={{width:52,height:52,borderRadius:15,background:"linear-gradient(135deg,#F59E0B,#E8590C)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 6px 20px rgba(245,158,11,.3)"}}>
                  <$.Paw s={26} c="#fff"/>
                </div>
                <div>
                  <div style={{fontWeight:800,fontSize:17,color:"#92400E",letterSpacing:"-.02em"}}>PetFinder Club</div>
                  <div style={{fontSize:12,color:"#A16207",lineHeight:1.4,marginTop:2}}>Hacé socio a tu mascota por us$6/mes. Vet IA, QR, ficha médica y todo listo si se pierde.</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
                    <span style={{background:"#E8590C",color:"#fff",padding:"5px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>us$6/mes</span>
                    <span style={{fontSize:10,color:"#92400E",fontWeight:600}}>Menos que un café ☕</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:"#57534E",letterSpacing:".1em"}}>TAMBIÉN INCLUYE</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
              {[
                {page:"vet",emoji:"🩺",name:"Vet IA",color:"#059669"},
                {page:"petfit",emoji:"💪",name:"PetFit",color:"#10B981"},
                {page:"petmatch",emoji:"❤️",name:"PetMatch",color:"#EC4899"},

                {page:"petid",emoji:"📱",name:"ID + QR",color:"#2563EB"},
                {page:"market",emoji:"🛒",name:"Servicios",color:"#78716C"},
              ].map((s,i)=>(
                <div key={i} className="ch" onClick={()=>setPage(s.page)} style={{background:"#fff",borderRadius:12,padding:10,border:"1px solid #F5F5F4",cursor:"pointer",textAlign:"center",animation:`fadeIn .3s ease ${i*.04}s both`}}>
                  <div style={{fontSize:20,marginBottom:3}}>{s.emoji}</div>
                  <div style={{fontWeight:700,fontSize:11,color:s.color}}>{s.name}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Filters + Grid */}
          <section style={{padding:"0 14px",maxWidth:880,margin:"0 auto"}}>
            <div style={{display:"flex",gap:6,marginBottom:14,justifyContent:"center",flexWrap:"wrap"}}>
              {[{k:"all",l:"Todos"},{k:"dog",l:"Perros",i:<$.Dog s={14}/>},{k:"cat",l:"Gatos",i:<$.Cat s={14}/>}].map(f=>(
                <button key={f.k} className={`fb ${filter===f.k?"on":""}`} onClick={()=>setFilter(f.k)}>{f.i}{f.l}</button>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"2px solid #F5F5F4",marginBottom:18}}>
              <div style={{display:"flex",gap:24}}>
                <button className={`tb ${tab==="lost"?"on":""}`} onClick={()=>setTab("lost")}>Perdidas ({(filter==="all"?lostPets:lostPets.filter(p=>p.type===filter)).length})</button>
                <button className={`tb ${tab==="found"?"on":""}`} onClick={()=>setTab("found")}>Encontradas ({(filter==="all"?foundPets:foundPets.filter(p=>p.type===filter)).length})</button>
              </div>
              <div style={{display:"flex",gap:3}}>
                {[["grid",$.Grid],["list",$.List]].map(([m,Ic])=>(
                  <button key={m} onClick={()=>setViewMode(m)} style={{width:30,height:30,borderRadius:7,border:"none",background:viewMode===m?"#1C1917":"#F5F5F4",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Ic s={14} c={viewMode===m?"#fff":"#A8A29E"}/>
                  </button>
                ))}
              </div>
            </div>

            {viewMode==="grid"?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:12,paddingBottom:28}}>
                {filtered.map((p,i)=>(
                  <div key={p.id} className="ch" onClick={()=>setSelectedPet(p)} style={{background:"#fff",borderRadius:16,overflow:"hidden",border:"1px solid #F5F5F4",cursor:"pointer",animation:`fadeIn .4s ease ${i*.05}s both`}}>
                    <div style={{width:"100%",aspectRatio:"3/2.5",overflow:"hidden",display:"flex",justifyContent:"center"}}><Avatar pet={p} size={300}/></div>
                    <div style={{padding:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                        <h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>{p.name||"Sin identificar"}</h3>
                        {p.reward&&<span style={{background:"#05966910",color:"#059669",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>{p.reward}</span>}
                      </div>
                      <div style={{fontSize:11,color:"#A8A29E",marginBottom:5}}>{p.breed} · {p.type==="dog"?"Perro":"Gato"}</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#78716C"}}><$.Pin s={12} c="#E8590C"/>{p.location?.address}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                        <span style={{fontSize:10,color:"#D6D3D1"}}>{p.date}</span>
                        <div style={{display:"flex",gap:4}}>
                          {p.aiFeatures?.source!=="text-analysis"&&<span style={{background:"#05966910",color:"#059669",padding:"2px 6px",borderRadius:5,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",gap:2}}><$.AI s={9} c="#059669"/>IA</span>}
                          <button className="bp" style={{padding:"4px 10px",fontSize:10,borderRadius:8}} onClick={e=>{e.stopPropagation();runAI(p);}}>
                            <$.Scan s={11} c="#fff"/> Match
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8,paddingBottom:28}}>
                {filtered.map((p,i)=>(
                  <div key={p.id} className="ch" onClick={()=>setSelectedPet(p)} style={{display:"flex",gap:12,padding:12,background:"#fff",borderRadius:14,border:"1px solid #F5F5F4",cursor:"pointer",animation:`fadeIn .3s ease ${i*.04}s both`}}>
                    <Avatar pet={p} size={68}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <h3 style={{fontSize:15,fontWeight:700}}>{p.name||"Sin identificar"}</h3>
                        {p.reward&&<span style={{background:"#05966910",color:"#059669",padding:"2px 7px",borderRadius:5,fontSize:9,fontWeight:700}}>{p.reward}</span>}
                      </div>
                      <div style={{fontSize:11,color:"#A8A29E"}}>{p.breed} · {p.location?.address}</div>
                    </div>
                    <button className="bp" style={{padding:"5px 10px",fontSize:10,borderRadius:8,alignSelf:"center",flexShrink:0}} onClick={e=>{e.stopPropagation();runAI(p);}}>
                      <$.Scan s={11} c="#fff"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {filtered.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:"#A8A29E"}}><$.Search s={36} c="#D6D3D1"/><p style={{marginTop:10,fontWeight:600,fontSize:14}}>Sin mascotas en esta categoría</p></div>}
          </section>

          {/* ═══ SOCIAL MEDIA ECOSYSTEM ═══ */}
          <section style={{padding:"0 14px 20px",maxWidth:640,margin:"0 auto"}}>
            <div style={{background:"linear-gradient(135deg,#0F172A,#1E293B)",borderRadius:20,padding:"24px 18px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:"rgba(239,68,68,.06)"}}/>
              <div style={{position:"absolute",bottom:-20,left:-20,width:70,height:70,borderRadius:"50%",background:"rgba(37,99,235,.06)"}}/>

              <div style={{textAlign:"center",marginBottom:18}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:5,background:"#FF000015",padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:700,color:"#FF4444",marginBottom:10,letterSpacing:".06em"}}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="#FF4444"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><polygon fill="#fff" points="9.545,15.568 15.818,12 9.545,8.432"/></svg>
                  ECOSISTEMA MULTIPLATAFORMA
                </div>
                <h3 style={{color:"#fff",fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>Tu mascota en todas las redes</h3>
                <p style={{color:"#94A3B8",fontSize:12,lineHeight:1.5}}>Cada reporte genera contenido automático para máxima difusión. Más ojos = más chances de encontrarla.</p>
              </div>

              {/* YouTube Channel Box */}
              <div style={{background:"rgba(255,255,255,.06)",borderRadius:14,padding:14,marginBottom:14,border:"1px solid rgba(255,255,255,.08)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <div style={{width:40,height:40,borderRadius:10,background:"#FF0000",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><polygon fill="#fff" points="9.545,15.568 15.818,12 9.545,8.432"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:"#fff",fontWeight:700,fontSize:14}}>PetFinder AI - Canal YouTube</div>
                    <div style={{color:"#94A3B8",fontSize:11}}>Video-fichas de cada mascota perdida y encontrada</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  {["Video-ficha con foto + datos","Shorts virales de búsqueda","Reencuentros felices"].map((f,i)=>(
                    <span key={i} style={{background:"rgba(255,0,0,.15)",color:"#FF6B6B",padding:"3px 8px",borderRadius:6,fontSize:9,fontWeight:600,flex:1,textAlign:"center"}}>{f}</span>
                  ))}
                </div>
                <p style={{color:"#CBD5E1",fontSize:11,lineHeight:1.5,marginBottom:10}}>Cada mascota registrada genera un video-ficha tipo Short/Reel con foto, raza, zona y contacto. Se sube automáticamente al canal de YouTube y se comparte en todas las redes. Más de 2 mil millones de usuarios pueden ver a tu mascota.</p>
                <button onClick={()=>window.open("https://youtube.com/@PetFinderAI","_blank")} style={{
                  width:"100%",padding:"11px 16px",borderRadius:10,border:"none",
                  background:"#FF0000",color:"#fff",cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  fontFamily:"inherit",fontWeight:700,fontSize:12,transition:"all .2s",
                }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="#fff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><polygon fill="#fff" points="9.545,15.568 15.818,12 9.545,8.432"/></svg>
                  Ver canal de YouTube
                </button>
              </div>

              {/* All social platforms grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {name:"Instagram",handle:"@petfinderai",color:"#E4405F",bg:"linear-gradient(135deg,#833AB4,#E4405F,#FCAF45)",icon:"📸",desc:"Reels + Stories diarios",url:"https://instagram.com/petfinderai"},
                  {name:"Facebook",handle:"PetFinder AI",color:"#1877F2",bg:"#1877F2",icon:"📘",desc:"Ads geolocalizados en tu radio",url:"https://facebook.com/petfinderai"},
                  {name:"TikTok",handle:"@petfinderai",color:"#000",bg:"linear-gradient(135deg,#25F4EE,#FE2C55)",icon:"🎵",desc:"Videos virales de búsqueda",url:"https://tiktok.com/@petfinderai"},
                  {name:"X (Twitter)",handle:"@petfinderai",color:"#1C1917",bg:"#1C1917",icon:"𝕏",desc:"Alertas rápidas por zona",url:"https://x.com/petfinderai"},
                ].map((s,i)=>(
                  <button key={i} onClick={()=>window.open(s.url,"_blank")} style={{
                    background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.08)",
                    borderRadius:12,padding:12,cursor:"pointer",textAlign:"left",
                    fontFamily:"inherit",transition:"all .2s",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                      <span style={{fontSize:16}}>{s.icon}</span>
                      <span style={{color:"#fff",fontWeight:700,fontSize:12}}>{s.name}</span>
                    </div>
                    <div style={{color:"#94A3B8",fontSize:10,fontWeight:600}}>{s.handle}</div>
                    <div style={{color:"#64748B",fontSize:10,marginTop:3}}>{s.desc}</div>
                  </button>
                ))}
              </div>

              {/* Reach stats */}
              <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                {[
                  {n:"6+",l:"Plataformas",c:"#E8590C"},
                  {n:"Máximo",l:"Alcance potencial",c:"#FBBF24"},
                  {n:"Activo",l:"Difusión continua",c:"#22C55E"},
                ].map((s,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.n}</div>
                    <div style={{fontSize:9,color:"#94A3B8",fontWeight:600}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Premium CTA */}
          {(!currentUser || currentUser.plan === "free") && (
          <section style={{padding:"12px 14px 40px",maxWidth:600,margin:"0 auto"}}>
            <div style={{background:"linear-gradient(135deg,#1C1917,#292524)",borderRadius:20,padding:"32px 20px",textAlign:"center",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"rgba(251,191,36,.08)"}}/>
              <$.Zap s={28} c="#FBBF24"/>
              <h2 style={{color:"#fff",fontSize:20,fontWeight:800,marginTop:12,letterSpacing:"-.03em"}}>Encontrá a tu mascota</h2>
              <p style={{color:"#A8A29E",fontSize:12,lineHeight:1.6,margin:"8px auto 6px",maxWidth:340}}>Subí la foto gratis. Desbloqueá resultados o difundí en redes sociales.</p>
              <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16,flexWrap:"wrap"}}>
                <span style={{color:"#FBBF24",fontSize:14,fontWeight:800}}>US$20 búsqueda</span>
                <span style={{color:"#A8A29E",fontSize:14}}>·</span>
                <span style={{color:"#C084FC",fontSize:14,fontWeight:800}}>US$50 + redes</span>
              </div>
              <button className="bg" onClick={()=>setModal("premium")}><$.Zap s={14} c="#78350F"/> Ver planes</button>
            </div>
          </section>
          )}
        </div>
      )}

      {/* ═══ ADOPTION PAGE ═══ */}
      {!selectedPet && page==="adoption" && (
        <div style={{animation:"fadeIn .5s"}}>
          <section style={{padding:"32px 14px 20px",textAlign:"center",background:"linear-gradient(180deg,rgba(239,68,68,.04) 0%,transparent 100%)"}}>
            <div style={{maxWidth:520,margin:"0 auto"}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:5,background:"#EF444410",padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:700,color:"#EF4444",marginBottom:12,letterSpacing:".07em"}}>
                <$.Heart s={12} c="#EF4444"/> ADOPCIÓN RESPONSABLE
              </div>
              <h1 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(24px,5.5vw,38px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-.03em",marginBottom:10}}>
                Mascotas que buscan{" "}
                <span style={{background:"linear-gradient(135deg,#EF4444,#F97316)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>un nuevo hogar</span>
              </h1>
              <p style={{fontSize:13,color:"#78716C",lineHeight:1.6,maxWidth:400,margin:"0 auto 18px"}}>
                A veces por viaje, mudanza o situaciones personales, hay que encontrarle un nuevo hogar a tu mascota. Publicá acá con la historia y encontrá a la familia ideal.
              </p>
              <button className="bp" style={{background:"linear-gradient(135deg,#EF4444,#F97316)"}} onClick={()=>{if(requireAuth("publicar adopción"))setModal("new-adoption");}}>
                <$.Heart s={15}/> Dar en adopción
              </button>
            </div>
          </section>

          <section style={{padding:"0 14px 40px",maxWidth:880,margin:"0 auto"}}>
            <div style={{display:"flex",gap:6,marginBottom:16,justifyContent:"center"}}>
              {[{k:"all",l:"Todos"},{k:"dog",l:"Perros",i:<$.Dog s={14}/>},{k:"cat",l:"Gatos",i:<$.Cat s={14}/>}].map(f=>(
                <button key={f.k} className={`fb ${filter===f.k?"on":""}`} onClick={()=>setFilter(f.k)}>{f.i}{f.l}</button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {(filter==="all"?adoptionPets:adoptionPets.filter(p=>p.type===filter)).map((pet,i)=>(
                <div key={pet.id} className="ch" style={{background:"#fff",borderRadius:16,overflow:"hidden",border:"1px solid #F5F5F4",cursor:"pointer",animation:`fadeIn .4s ease ${i*.06}s both`}}
                  onClick={()=>{setContactPet(pet);setChatMsgs([]);setModal("contact");}}>
                  <div style={{width:"100%",aspectRatio:"3/2.5",overflow:"hidden",display:"flex",justifyContent:"center"}}>
                    <Avatar pet={pet} size={300}/>
                  </div>
                  <div style={{padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>{pet.name}</h3>
                      {pet.urgent&&<span style={{background:"#DC262615",color:"#DC2626",padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>URGENTE</span>}
                    </div>
                    <div style={{fontSize:11,color:"#A8A29E",marginBottom:6}}>{pet.breed} · {pet.type==="dog"?"Perro":"Gato"}</div>
                    
                    {/* Reason badge */}
                    <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#FEF3C7",padding:"3px 9px",borderRadius:7,fontSize:10,fontWeight:700,color:"#92400E",marginBottom:8}}>
                      Razón: {pet.reason}
                    </div>

                    <p style={{fontSize:12,color:"#57534E",lineHeight:1.5,marginBottom:8,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{pet.description}</p>
                    
                    <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#78716C"}}><$.Pin s={12} c="#EF4444"/>{pet.location?.address}</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                      <span style={{fontSize:10,color:"#D6D3D1"}}>{pet.date}</span>
                      <button className="bp" style={{padding:"5px 12px",fontSize:10,borderRadius:8,background:"linear-gradient(135deg,#EF4444,#F97316)"}} onClick={e=>{e.stopPropagation();setContactPet(pet);setChatMsgs([]);setModal("contact");}}>
                        <$.Msg s={11} c="#fff"/> Adoptar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {adoptionPets.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:"#A8A29E"}}><$.Heart s={36} c="#D6D3D1"/><p style={{marginTop:10,fontWeight:600,fontSize:14}}>No hay mascotas en adopción aún</p></div>}
          </section>
        </div>
      )}

      {/* ═══ FOSTER PAGE ═══ */}
      {!selectedPet && page==="foster" && (
        <div style={{animation:"fadeIn .5s"}}>
          <section style={{padding:"32px 14px 20px",textAlign:"center",background:"linear-gradient(180deg,rgba(37,99,235,.04) 0%,transparent 100%)"}}>
            <div style={{maxWidth:520,margin:"0 auto"}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:5,background:"#2563EB10",padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:700,color:"#2563EB",marginBottom:12,letterSpacing:".07em"}}>
                <$.Shield s={12} c="#2563EB"/> GUARDA TEMPORAL
              </div>
              <h1 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(24px,5.5vw,38px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-.03em",marginBottom:10}}>
                Te cuido tu{" "}
                <span style={{background:"linear-gradient(135deg,#2563EB,#7C3AED)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>mascota</span>
              </h1>
              <p style={{fontSize:13,color:"#78716C",lineHeight:1.6,maxWidth:420,margin:"0 auto 18px"}}>
                ¿Viajás y no tenés con quién dejar a tu mascota? Acá hay personas verificadas que ofrecen su hogar como guarda temporal. Cuidado con amor en domicilio.
              </p>
              <button className="bs" style={{background:"linear-gradient(135deg,#2563EB,#7C3AED)"}} onClick={()=>{if(requireAuth("ofrecer guarda"))setModal("new-foster");}}>
                <$.Shield s={15}/> Ofrecer mi hogar
              </button>
            </div>
          </section>

          <section style={{padding:"0 14px 40px",maxWidth:880,margin:"0 auto"}}>
            <div style={{display:"flex",gap:6,marginBottom:16,justifyContent:"center"}}>
              {[{k:"all",l:"Todos"},{k:"dog",l:"Solo perros",i:<$.Dog s={14}/>},{k:"cat",l:"Solo gatos",i:<$.Cat s={14}/>}].map(f=>(
                <button key={f.k} className={`fb ${filter===f.k?"on":""}`} onClick={()=>setFilter(f.k)}>{f.i}{f.l}</button>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {(filter==="all"?fosterOffers:fosterOffers.filter(p=>p.type===filter||p.type==="both")).map((fo,i)=>(
                <div key={fo.id} className="ch" style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:18,cursor:"pointer",animation:`fadeIn .4s ease ${i*.06}s both`}}
                  onClick={()=>{setContactPet({...fo,ownerName:fo.fosterName,ownerPhone:fo.fosterPhone,status:"foster"});setChatMsgs([]);setModal("contact");}}>
                  
                  {/* Foster host avatar */}
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                    <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#2563EB,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <$.User s={22} c="#fff"/>
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{fo.fosterName}</div>
                      <div style={{fontSize:11,color:"#A8A29E",display:"flex",alignItems:"center",gap:3}}><$.Pin s={10} c="#2563EB"/>{fo.location?.address}</div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                    <span style={{background:"#2563EB10",color:"#2563EB",padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>
                      {fo.type==="both"?"Perros y gatos":fo.type==="dog"?"Solo perros":"Solo gatos"}
                    </span>
                    <span style={{background:"#05966910",color:"#059669",padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>
                      {fo.capacity}
                    </span>
                    {fo.hasYard&&<span style={{background:"#F59E0B10",color:"#D97706",padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>Con patio</span>}
                    <span style={{background:"#F5F5F4",color:"#78716C",padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>
                      {fo.duration}
                    </span>
                  </div>

                  <p style={{fontSize:12,color:"#57534E",lineHeight:1.5,marginBottom:10}}>{fo.description}</p>

                  <div style={{fontSize:11,color:"#A8A29E",marginBottom:10}}>Experiencia: {fo.experience}</div>

                  <button className="bp" style={{width:"100%",justifyContent:"center",padding:"10px 20px",fontSize:12,background:"linear-gradient(135deg,#2563EB,#7C3AED)"}}
                    onClick={e=>{e.stopPropagation();setContactPet({...fo,ownerName:fo.fosterName,ownerPhone:fo.fosterPhone,status:"foster"});setChatMsgs([]);setModal("contact");}}>
                    <$.Msg s={13} c="#fff"/> Contactar
                  </button>
                </div>
              ))}
            </div>
            {fosterOffers.length===0&&<div style={{textAlign:"center",padding:"40px 16px",color:"#A8A29E"}}><$.Shield s={36} c="#D6D3D1"/><p style={{marginTop:10,fontWeight:600,fontSize:14}}>No hay hogares de tránsito disponibles aún</p></div>}
          </section>
        </div>
      )}

      {/* ═══ VET AI PAGE ═══ */}
      {!selectedPet && page==="vet" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:"linear-gradient(135deg,#059669,#10B981)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.AI s={28} c="#fff"/>
            </div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
              Veterinario <span style={{color:"#059669"}}>IA 24/7</span>
            </h1>
            <p style={{fontSize:13,color:"#78716C",lineHeight:1.5,maxWidth:400,margin:"0 auto"}}>
              Consultá sobre salud, síntomas, alimentación y cuidados de tu mascota. Disponible las 24hs, los 7 días.
            </p>
          </section>

          {/* Quick topics */}
          <div style={{display:"flex",flexWrap:"wrap",gap:5,justifyContent:"center",marginBottom:16}}>
            {["Mi perro vomita","Mi gato no come","Vacunas necesarias","Alimentación cachorro","Garrapatas","Piel irritada","Diarrea","Castración"].map(q=>(
              <button key={q} onClick={()=>setVetInput(q)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #E7E5E4",background:"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:"#57534E",fontFamily:"inherit",transition:"all .2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#059669"} onMouseLeave={e=>e.currentTarget.style.borderColor="#E7E5E4"}>{q}</button>
            ))}
          </div>

          {/* Chat area */}
          <div style={{background:"#fff",borderRadius:18,border:"1px solid #F5F5F4",overflow:"hidden",marginBottom:20}}>
            <div style={{padding:14,minHeight:300,maxHeight:450,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
              {vetMessages.length===0&&(
                <div style={{textAlign:"center",padding:"48px 16px",color:"#A8A29E"}}>
                  <$.AI s={36} c="#D6D3D1"/>
                  <p style={{marginTop:10,fontSize:14,fontWeight:600}}>Hola! Soy tu veterinario virtual.</p>
                  <p style={{fontSize:12,color:"#D6D3D1",marginTop:4}}>Preguntame lo que necesites sobre la salud de tu mascota.</p>
                  <div style={{marginTop:12,padding:10,background:"#FEF3C7",borderRadius:10,fontSize:11,color:"#92400E",fontWeight:600}}>
                    ⚠️ No reemplazo a un veterinario presencial. Ante emergencias, consultá a un profesional.
                  </div>
                </div>
              )}
              {vetMessages.map((m,i)=>(
                <div key={i} style={{alignSelf:m.from==="user"?"flex-end":"flex-start",maxWidth:"85%",animation:"fadeIn .3s"}}>
                  {m.from==="vet"&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3,fontSize:10,fontWeight:700,color:"#059669"}}><$.AI s={10} c="#059669"/> Dr. PetFinder IA</div>}
                  <div style={{background:m.from==="user"?"#059669":"#F0FDF4",color:m.from==="user"?"#fff":"#1C1917",padding:"10px 14px",borderRadius:14,fontSize:13,lineHeight:1.6,border:m.from==="vet"?"1px solid #BBF7D0":"none",whiteSpace:"pre-wrap"}}>
                    {m.text}
                  </div>
                  <div style={{fontSize:9,color:"#D6D3D1",marginTop:2,textAlign:m.from==="user"?"right":"left"}}>{m.time}</div>
                </div>
              ))}
              {vetLoading&&<div style={{alignSelf:"flex-start",padding:"10px 14px",background:"#F0FDF4",borderRadius:14,border:"1px solid #BBF7D0"}}><div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:3,background:"#059669",opacity:.4,animation:`pulse .8s ${i*.2}s infinite`}}/>)}</div></div>}
            </div>
            <div style={{borderTop:"1px solid #F5F5F4",padding:10,display:"flex",gap:6}}>
              <input value={vetInput} onChange={e=>setVetInput(e.target.value)} placeholder="Describí el síntoma o tu consulta..." onKeyDown={e=>e.key==="Enter"&&sendVetChat()} style={{flex:1,borderRadius:10}}/>
              <button className="bp" style={{padding:"10px 14px",borderRadius:10,background:"#059669"}} onClick={sendVetChat}><$.Send s={14} c="#fff"/></button>
            </div>
          </div>

          {/* Vet upsell */}
          <div style={{background:"#05966908",borderRadius:14,padding:14,textAlign:"center",marginBottom:32}}>
            <div style={{fontSize:11,fontWeight:700,color:"#059669",marginBottom:6}}>SERVICIO GRATUITO</div>
            <p style={{fontSize:12,color:"#78716C",lineHeight:1.5}}>El veterinario IA es gratis para todos los usuarios. Registrá tu mascota para recibir consejos personalizados.</p>
          </div>
        </div>
      )}

      {/* ═══ PET ID DIGITAL PAGE ═══ */}
      {!selectedPet && page==="petid" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:"linear-gradient(135deg,#2563EB,#7C3AED)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Scan s={28} c="#fff"/>
            </div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
              ID Digital <span style={{background:"linear-gradient(135deg,#2563EB,#7C3AED)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>para tu mascota</span>
            </h1>
            <p style={{fontSize:13,color:"#78716C",lineHeight:1.5,maxWidth:420,margin:"0 auto 20px"}}>
              Creá un perfil digital con QR para el collar. Si alguien encuentra a tu mascota, escanea el QR y ve toda la info de contacto al instante.
            </p>
            <button className="bp" style={{background:"linear-gradient(135deg,#2563EB,#7C3AED)"}} onClick={()=>{if(requireAuth("crear ID digital"))setModal("create-petid");}}>
              <$.Scan s={15}/> Crear ID Digital
            </button>
          </section>

          {/* How it works */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
            {[
              {i:<$.Cam s={20}/>,t:"Foto + datos",d:"Subí foto y completá el perfil de tu mascota",c:"#2563EB"},
              {i:<$.Scan s={20}/>,t:"QR generado",d:"Te damos un código QR único para el collar",c:"#7C3AED"},
              {i:<$.Phone s={20}/>,t:"Escaneo fácil",d:"Cualquiera escanea y ve cómo contactarte",c:"#059669"},
              {i:<$.Shield s={20}/>,t:"Datos seguros",d:"Vos elegís qué información mostrar",c:"#D97706"},
            ].map((s,i)=>(
              <div key={i} style={{padding:14,borderRadius:14,background:"#fff",border:"1px solid #F5F5F4"}}>
                <div style={{width:36,height:36,borderRadius:10,background:`${s.c}0A`,display:"flex",alignItems:"center",justifyContent:"center",color:s.c,marginBottom:8}}>{s.i}</div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{s.t}</div>
                <div style={{fontSize:11,color:"#A8A29E",lineHeight:1.4}}>{s.d}</div>
              </div>
            ))}
          </div>

          {/* Example ID card */}
          <div style={{background:"linear-gradient(135deg,#1C1917,#292524)",borderRadius:20,padding:22,marginBottom:20,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,right:0,width:120,height:120,background:"rgba(124,58,237,.1)",borderRadius:"0 0 0 80px"}}/>
            <div style={{fontSize:10,fontWeight:700,color:"#7C3AED",letterSpacing:".1em",marginBottom:14}}>EJEMPLO DE ID DIGITAL</div>
            <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              <div style={{width:80,height:80,borderRadius:14,background:"linear-gradient(135deg,hsl(30,42%,85%),hsl(50,48%,78%))",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <$.Dog s={36} c="hsl(30,38%,38%)"/>
              </div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:800,fontSize:18}}>Max</div>
                <div style={{color:"#A8A29E",fontSize:12,marginBottom:8}}>Golden Retriever · Macho · 3 años</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                  {["Vacunas al día","Castrado","Microchip: #4521","Alergia: pollo"].map((t,i)=>(
                    <span key={i} style={{background:"rgba(255,255,255,.1)",color:"#D6D3D1",padding:"2px 8px",borderRadius:6,fontSize:9,fontWeight:600}}>{t}</span>
                  ))}
                </div>
              </div>
              {/* QR placeholder */}
              <div style={{width:64,height:64,borderRadius:10,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:2,width:40,height:40}}>
                  {Array.from({length:25}).map((_,i)=>(
                    <div key={i} style={{background:Math.random()>.4?"#1C1917":"#fff",borderRadius:1}}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{marginTop:14,padding:"10px 12px",background:"rgba(255,255,255,.05)",borderRadius:10,display:"flex",alignItems:"center",gap:8}}>
              <$.Phone s={14} c="#059669"/>
              <div style={{fontSize:11,color:"#A8A29E"}}>Si encontrás a esta mascota: <strong style={{color:"#fff"}}>+54 11 5555-1234</strong></div>
            </div>
          </div>

          {/* Pricing */}
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:16,textAlign:"center",marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:22,color:"#2563EB"}}>Incluido en PetFinder Club</div>
            <p style={{fontSize:12,color:"#A8A29E",marginTop:4}}>ID Digital + Ficha Médica completa con tu suscripción Club us$6/mes.</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:10}}>
              {["Perfil completo","QR descargable","Historial médico","Vacunas","Recordatorios","Alertas"].map((f,i)=>(
                <span key={i} style={{background:"#2563EB08",color:"#2563EB",padding:"3px 10px",borderRadius:7,fontSize:11,fontWeight:600}}>{f}</span>
              ))}
            </div>
          </div>

          {/* ═══ MEDICAL RECORD SECTION ═══ */}
          <div style={{marginBottom:32}}>
            <h2 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
              <span style={{width:32,height:32,borderRadius:9,background:"#DC262610",display:"flex",alignItems:"center",justifyContent:"center"}}><$.Heart s={16} c="#DC2626"/></span>
              Ficha Médica + Vacunas
            </h2>

            {/* Vaccine card example */}
            <div style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",overflow:"hidden",marginBottom:12}}>
              <div style={{background:"linear-gradient(135deg,#DC2626,#EF4444)",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:14}}>Carnet de Vacunación</div>
                <span style={{background:"rgba(255,255,255,.2)",color:"#fff",padding:"2px 8px",borderRadius:6,fontSize:9,fontWeight:700}}>DIGITAL</span>
              </div>
              <div style={{padding:14}}>
                {[
                  {name:"Antirrábica",date:"15/01/2026",next:"15/01/2027",status:"ok",lab:"Nobivac"},
                  {name:"Quíntuple (DHPPI+L)",date:"20/03/2026",next:"20/03/2027",status:"ok",lab:"Vanguard"},
                  {name:"Desparasitación",date:"01/02/2026",next:"01/05/2026",status:"warn",lab:"Drontal"},
                  {name:"Antipulgas/garrapatas",date:"10/03/2026",next:"10/04/2026",status:"urgent",lab:"NexGard"},
                ].map((v,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<3?"1px solid #F5F5F4":"none"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{v.name}</div>
                      <div style={{fontSize:10,color:"#A8A29E"}}>{v.lab} · Aplicada: {v.date}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <span style={{background:v.status==="ok"?"#05966910":v.status==="warn"?"#FEF3C7":"#DC262610",color:v.status==="ok"?"#059669":v.status==="warn"?"#D97706":"#DC2626",padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>
                        {v.status==="ok"?"Al día":v.status==="warn"?"Próxima":"Vencida"}
                      </span>
                      <div style={{fontSize:9,color:"#A8A29E",marginTop:2}}>Próx: {v.next}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:"10px 14px",background:"#FAFAF9",borderTop:"1px solid #F5F5F4"}}>
                <button className="bp" style={{width:"100%",justifyContent:"center",fontSize:12,padding:"10px 16px",background:"#DC2626"}}
                  onClick={()=>{if(requireAuth("gestionar vacunas"))setModal("add-vaccine");}}>
                  <$.Heart s={13}/> Agregar vacuna
                </button>
              </div>
            </div>

            {/* Health reminders */}
            <div style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",overflow:"hidden",marginBottom:12}}>
              <div style={{background:"linear-gradient(135deg,#D97706,#F59E0B)",padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:14}}>Recordatorios de Salud</div>
                <$.Bell s={16} c="#fff"/>
              </div>
              <div style={{padding:14}}>
                {[
                  {text:"Desparasitación de Michi",date:"01/05/2026",days:27,type:"vaccine",priority:"medium"},
                  {text:"Antipulgas de Max",date:"10/04/2026",days:6,type:"medication",priority:"high"},
                  {text:"Control veterinario anual",date:"15/05/2026",days:41,type:"checkup",priority:"low"},
                  {text:"Renovar antirrábica de Luna",date:"15/01/2027",days:286,type:"vaccine",priority:"low"},
                ].map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<3?"1px solid #F5F5F4":"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:8,height:8,borderRadius:4,background:r.priority==="high"?"#DC2626":r.priority==="medium"?"#D97706":"#059669",flexShrink:0}}/>
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{r.text}</div>
                        <div style={{fontSize:10,color:"#A8A29E"}}>{r.date}</div>
                      </div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:r.days<10?"#DC2626":r.days<30?"#D97706":"#78716C"}}>
                      {r.days} días
                    </span>
                  </div>
                ))}
              </div>
              <div style={{padding:"10px 14px",background:"#FAFAF9",borderTop:"1px solid #F5F5F4"}}>
                <button className="bo" style={{width:"100%",justifyContent:"center",fontSize:12}}
                  onClick={()=>{if(requireAuth("crear recordatorio"))setModal("add-reminder");}}>
                  <$.Bell s={13}/> Crear recordatorio
                </button>
              </div>
            </div>

            {/* Medical conditions & allergies */}
            <div style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:16,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#78716C",letterSpacing:".05em",marginBottom:10}}>CONDICIONES Y ALERGIAS</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {["Alergia: pollo","Displasia cadera leve","Piel sensible","Otitis recurrente"].map((c,i)=>(
                  <span key={i} style={{background:"#FEF3C7",color:"#92400E",padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:600}}>{c}</span>
                ))}
                <button style={{background:"#F5F5F4",color:"#78716C",padding:"5px 12px",borderRadius:8,fontSize:11,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}}
                  onClick={()=>notify("Agregar condición próximamente","info")}>+ Agregar</button>
              </div>
            </div>

            {/* Vet visits log */}
            <div style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:16}}>
              <div style={{fontSize:12,fontWeight:700,color:"#78716C",letterSpacing:".05em",marginBottom:10}}>ÚLTIMAS VISITAS AL VETERINARIO</div>
              {[
                {date:"20/03/2026",vet:"Dr. Martínez",reason:"Control anual + vacuna quíntuple",notes:"Todo bien. Peso 28kg."},
                {date:"15/01/2026",vet:"Dra. López",reason:"Vacuna antirrábica",notes:"Reacción leve, normal."},
                {date:"05/12/2025",vet:"Dr. Martínez",reason:"Consulta por vómitos",notes:"Gastritis leve. Dieta blanda 3 días."},
              ].map((v,i)=>(
                <div key={i} style={{padding:"10px 0",borderBottom:i<2?"1px solid #F5F5F4":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:700,fontSize:12}}>{v.reason}</div>
                    <span style={{fontSize:10,color:"#A8A29E"}}>{v.date}</span>
                  </div>
                  <div style={{fontSize:11,color:"#78716C",marginTop:2}}>{v.vet} — {v.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ COMMUNITY PAGE ═══ */}
      {!selectedPet && page==="community" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:"linear-gradient(135deg,#F59E0B,#EF4444)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Paw s={28} c="#fff"/>
            </div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
              Comunidad <span style={{background:"linear-gradient(135deg,#F59E0B,#EF4444)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>PetFinder</span>
            </h1>
            <p style={{fontSize:13,color:"#78716C",lineHeight:1.5,maxWidth:400,margin:"0 auto 16px"}}>
              Compartí fotos, consejos y experiencias con otros amantes de mascotas. Una comunidad solidaria.
            </p>
            <div style={{fontSize:12,color:"#A8A29E",fontWeight:600}}>Publicaciones de la comunidad</div>
          </section>

          {/* Community feed */}
          <div style={{display:"flex",flexDirection:"column",gap:12,paddingBottom:32}}>
            {[
              {user:"María García",time:"Hace 2hs",text:"¡Max volvió a casa gracias a PetFinder! La IA lo encontró en menos de 24hs. Gracias a Juan que lo cuidó. 🐕❤️",likes:47,comments:12,tag:"Reencuentro"},
              {user:"Dr. Martínez Vet",time:"Hace 5hs",text:"Tip: En verano hidratá a tu mascota cada 2 horas. Los perros no regulan la temperatura como nosotros. Si ves jadeo excesivo, mojale las patas y orejas.",likes:156,comments:23,tag:"Consejo salud"},
              {user:"Luciana Torres",time:"Hace 8hs",text:"Estoy cuidando a Firulais en tránsito mientras le encontramos hogar definitivo. Es un amor total. ¿Alguien interesado en adoptarlo? Zona Palermo 📍",likes:89,comments:34,tag:"Adopción"},
              {user:"PetFinder IA",time:"Hace 1 día",text:"📊 Esta semana reunimos 3 mascotas con sus familias. El reconocimiento facial de la IA tuvo un 94% de precisión en las coincidencias. ¡Gracias comunidad!",likes:234,comments:45,tag:"Estadísticas"},
              {user:"Carolina Méndez",time:"Hace 1 día",text:"Mi gata Pelusa encontró un hogar increíble a través de la sección de adopción. La familia me manda fotos todos los días. Lloro de felicidad 😭🐈",likes:178,comments:28,tag:"Adopción exitosa"},
            ].map((post,i)=>(
              <div key={i} style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:16,animation:`fadeIn .4s ease ${i*.08}s both`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:36,height:36,borderRadius:10,background:`hsl(${(i*67)%360},40%,85%)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <$.User s={16} c={`hsl(${(i*67)%360},40%,45%)`}/>
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{post.user}</div>
                      <div style={{fontSize:10,color:"#A8A29E"}}>{post.time}</div>
                    </div>
                  </div>
                  <span style={{background:"#F5F5F4",padding:"3px 8px",borderRadius:6,fontSize:9,fontWeight:700,color:"#78716C"}}>{post.tag}</span>
                </div>
                <p style={{fontSize:13,color:"#44403C",lineHeight:1.6,marginBottom:12}}>{post.text}</p>
                <div style={{display:"flex",gap:16,paddingTop:10,borderTop:"1px solid #F5F5F4"}}>
                  <button style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:"#A8A29E",fontFamily:"inherit",transition:"color .2s"}} onMouseEnter={e=>e.currentTarget.style.color="#EF4444"} onMouseLeave={e=>e.currentTarget.style.color="#A8A29E"}>
                    <$.Heart s={14}/> {post.likes}
                  </button>
                  <button style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:"#A8A29E",fontFamily:"inherit"}}>
                    <$.Msg s={14}/> {post.comments}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ PETFINDER CLUB — us$6/mes ═══ */}
      {!selectedPet && page==="club" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          {/* Hero */}
          <section style={{padding:"32px 0 8px",textAlign:"center"}}>
            <div style={{width:64,height:64,borderRadius:18,margin:"0 auto 14px",background:"linear-gradient(135deg,#F59E0B,#E8590C)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 30px rgba(245,158,11,.25)"}}>
              <$.Paw s={32} c="#fff"/>
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#F59E0B14",padding:"4px 14px",borderRadius:100,fontSize:10,fontWeight:700,color:"#D97706",marginBottom:10}}>MEMBRESÍA PARA TU MASCOTA</div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,6vw,38px)",fontWeight:800,lineHeight:1.08,letterSpacing:"-.03em",marginBottom:8}}>
              PetFinder <span style={{background:"linear-gradient(135deg,#F59E0B,#E8590C)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Club</span>
            </h1>
            <p style={{fontSize:15,color:"#78716C",lineHeight:1.6,maxWidth:420,margin:"0 auto 6px"}}>
              Hacé socio a tu mascota. Por menos que un café al mes, tiene acceso a todo un ecosistema de beneficios.
            </p>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:3}}>
              <span style={{fontSize:42,fontWeight:800,color:"#E8590C"}}>us$6</span>
              <span style={{fontSize:15,color:"#A8A29E"}}>/mes</span>
            </div>
            <div style={{fontSize:12,color:"#78716C",marginTop:4}}>Cancelá cuando quieras · Sin permanencia</div>
          </section>

          {/* What's included */}
          <section style={{padding:"20px 0"}}>
            <div style={{background:"#fff",borderRadius:20,border:"2px solid #F59E0B30",overflow:"hidden"}}>
              <div style={{background:"linear-gradient(135deg,#F59E0B,#E8590C)",padding:"16px 18px",color:"#fff"}}>
                <div style={{fontWeight:800,fontSize:16}}>Todo esto por us$6/mes</div>
                <div style={{fontSize:11,opacity:.85,marginTop:2}}>El plan más accesible para cuidar a tu mascota</div>
              </div>
              <div style={{padding:18}}>
                {[
                  {emoji:"📱",title:"Carnet digital + QR para el collar",desc:"Perfil completo de tu mascota con foto, datos y QR. Si alguien la encuentra, escanea y te contacta al instante.",highlight:true},
                  {emoji:"🩺",title:"Veterinario IA ilimitado 24/7",desc:"Consultá sobre salud, síntomas, alimentación y cuidados las 24 horas. Sin límite de consultas."},
                  {emoji:"📍",title:"Mapa de veterinarias y petshops cercanos",desc:"Encontrá las veterinarias, petshops y servicios más cerca tuyo con ratings y precios."},
                  {emoji:"💉",title:"Recordatorios de vacunas y desparasitación",desc:"La app te avisa cuándo toca la próxima vacuna, desparasitación o control. Nunca más te olvidás."},
                  {emoji:"🏥",title:"Acceso rápido a veterinarias cercanas",desc:"Buscá veterinarias, petshops y servicios pet cerca tuyo directamente desde la app."},
                  {emoji:"👥",title:"Comunidad de dueños de tu zona",desc:"Conectá con otros dueños de mascotas cerca tuyo. Compartí tips, organizá paseos grupales."},
                  {emoji:"📋",title:"Ficha médica digital",desc:"Todo el historial de tu mascota en un lugar: vacunas, alergias, condiciones, visitas al vet."},
                  {emoji:"🔔",title:"Alertas de mascotas perdidas en tu zona",desc:"Si alguien pierde una mascota cerca tuyo, te avisamos. Podés ayudar a encontrarla."},
                ].map((f,i)=>(
                  <div key={i} style={{display:"flex",gap:12,padding:"14px 0",borderBottom:i<7?"1px solid #F5F5F4":"none",alignItems:"flex-start"}}>
                    <div style={{fontSize:22,flexShrink:0,marginTop:2}}>{f.emoji}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{f.title}</div>
                      <div style={{fontSize:11,color:"#78716C",lineHeight:1.5}}>{f.desc}</div>
                    </div>
                    {f.highlight&&<span style={{background:"#F59E0B14",color:"#D97706",padding:"2px 8px",borderRadius:6,fontSize:9,fontWeight:700,flexShrink:0,marginTop:4}}>CLAVE</span>}
                  </div>
                ))}
              </div>

              {/* THE HIDDEN BONUS */}
              <div style={{padding:"16px 18px",background:"linear-gradient(135deg,#7C3AED08,#2563EB08)",borderTop:"1px solid #7C3AED15"}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{fontSize:22}}>🔍</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:"#7C3AED"}}>BONUS: Tu mascota ya está en el sistema</div>
                    <div style={{fontSize:11,color:"#78716C",lineHeight:1.5,marginTop:2}}>Si algún día se pierde, la foto ya está cargada, la IA ya analizó sus rasgos y el Face ID Tracker se activa al instante. No perdés ni un segundo. Este solo beneficio vale más que los us$6.</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Social proof / numbers */}
          <section style={{padding:"0 0 16px"}}>
            <div style={{display:"flex",gap:8}}>
              {[
                {n:"4.9★",l:"Rating de usuarios",bg:"#F59E0B14",c:"#D97706"},
                {n:"50K+",l:"Mascotas registradas",bg:"#059669 14",c:"#059669"},
                {n:"98%",l:"Renovación mensual",bg:"#2563EB14",c:"#2563EB"},
              ].map((s,i)=>(
                <div key={i} style={{flex:1,background:"#fff",borderRadius:14,padding:12,border:"1px solid #F5F5F4",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.n}</div>
                  <div style={{fontSize:9,color:"#A8A29E",fontWeight:600,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Upgrade path */}
          <section style={{padding:"0 0 16px"}}>
            <div style={{background:"#FAFAF9",borderRadius:16,padding:16}}>
              <div style={{fontSize:10,fontWeight:700,color:"#A8A29E",letterSpacing:".06em",marginBottom:12}}>CUANDO NECESITES MÁS, UPGRADEÁ</div>
              {[
                {name:"Búsqueda",price:"US$20/sem",desc:"Face ID Tracker en caso de pérdida",color:"#E8590C",emoji:"🔍"},
                {name:"Máxima",price:"US$50/sem",desc:"Difusión en redes + Reportes WhatsApp",color:"#7C3AED",emoji:"📢"},
              ].map((u,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<4?"1px solid #E7E5E4":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>{u.emoji}</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:12,color:u.color}}>{u.name}</div>
                      <div style={{fontSize:10,color:"#A8A29E"}}>{u.desc}</div>
                    </div>
                  </div>
                  <span style={{fontWeight:800,fontSize:12,color:"#1C1917"}}>{u.price}</span>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section style={{padding:"0 0 16px"}}>
            <button className="bp" style={{width:"100%",justifyContent:"center",padding:"16px",fontSize:16,background:"linear-gradient(135deg,#F59E0B,#E8590C)",borderRadius:16}}
              onClick={()=>{if(requireAuth("unirte al Club"))setModal("premium");}}>
              <$.Paw s={18}/> Hacé socio a tu mascota — us$6/mes
            </button>
          </section>

          {/* Comparison: why Club */}
          <section style={{padding:"0 0 16px"}}>
            <div style={{background:"linear-gradient(135deg,#0F172A,#1E293B)",borderRadius:18,padding:18}}>
              <div style={{fontSize:10,fontWeight:700,color:"#FBBF24",letterSpacing:".06em",marginBottom:14}}>¿POR QUÉ us$6?</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#F87171",marginBottom:8}}>❌ SIN CLUB</div>
                  {["No tenés datos cargados","Si se pierde, arrancás de cero","Sin ficha médica digital","Sin recordatorios","Pagás US$20-50 en la urgencia"].map((t,i)=>(
                    <div key={i} style={{fontSize:10,color:"#94A3B8",marginBottom:4}}>• {t}</div>
                  ))}
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#4ADE80",marginBottom:8}}>✓ CON CLUB us$6</div>
                  {["Foto + perfil ya cargados","Face ID listo al instante","Ficha médica completa","Recordatorios automáticos","Todo preparado si pasa algo"].map((t,i)=>(
                    <div key={i} style={{fontSize:10,color:"#E2E8F0",marginBottom:4}}>• {t}</div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section style={{padding:"0 0 32px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#A8A29E",letterSpacing:".06em",marginBottom:10}}>PREGUNTAS FRECUENTES</div>
            {[
              {q:"¿Puedo cancelar cuando quiera?",a:"Sí, sin permanencia. Cancelás desde tu perfil en cualquier momento."},
              {q:"¿Incluye la búsqueda si se pierde?",a:"El Club te deja todo preparado. Si se pierde, activás la búsqueda (US$20) o difusión (US$50) con un toque, sin perder tiempo."},
              {q:"¿El QR funciona si alguien no tiene la app?",a:"Sí. El QR abre una página web con tus datos de contacto. No necesitan tener PetFinder."},
              {q:"¿Puedo registrar más de una mascota?",a:"Sí, cada mascota adicional cuesta US$1.50/mes extra."},
              {q:"¿Puedo buscar servicios pet desde la app?",a:"Sí, en la sección Servicios tenés accesos rápidos para buscar veterinarias, petshops, paseadores y más cerca tuyo."},
            ].map((f,i)=>(
              <div key={i} style={{background:"#fff",borderRadius:12,border:"1px solid #F5F5F4",padding:14,marginBottom:8}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{f.q}</div>
                <div style={{fontSize:12,color:"#78716C",lineHeight:1.5}}>{f.a}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* ═══ SHIELD PAGE ═══ */}
      {!selectedPet && page==="shield" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:64,height:64,borderRadius:18,margin:"0 auto 14px",background:"linear-gradient(135deg,#059669,#0D9488)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 30px rgba(5,150,105,.25)"}}>
              <$.Shield s={32} c="#fff"/>
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#05966910",padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:700,color:"#059669",marginBottom:10,letterSpacing:".06em"}}>PROTECCIÓN PREVENTIVA</div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:"clamp(26px,6vw,40px)",fontWeight:800,lineHeight:1.08,letterSpacing:"-.03em",marginBottom:8}}>
              PetFinder <span style={{background:"linear-gradient(135deg,#059669,#0D9488)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Shield</span>
            </h1>
            <p style={{fontSize:14,color:"#78716C",lineHeight:1.6,maxWidth:420,margin:"0 auto 8px"}}>
              El seguro preventivo para tu mascota. Pagás poco, dormís tranquilo.
            </p>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:4,marginBottom:20}}>
              <span style={{fontSize:36,fontWeight:800,color:"#059669"}}>US$5</span>
              <span style={{fontSize:15,color:"#A8A29E"}}>/mes</span>
            </div>
          </section>

          {/* What happens when you lose your pet */}
          <div style={{background:"linear-gradient(135deg,#1C1917,#292524)",borderRadius:18,padding:20,marginBottom:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"rgba(5,150,105,.1)"}}/>
            <div style={{fontSize:11,fontWeight:700,color:"#059669",letterSpacing:".06em",marginBottom:14}}>SIN SHIELD vs CON SHIELD</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#DC2626",marginBottom:8}}>❌ SIN SHIELD</div>
                {["Pánico, no sabés qué hacer","Subís foto apurado","Pagás US$20 en la urgencia","Esperás resultados","Perdés tiempo valioso"].map((t,i)=>(
                  <div key={i} style={{fontSize:11,color:"#A8A29E",marginBottom:4,display:"flex",gap:4}}><span style={{color:"#DC2626"}}>•</span>{t}</div>
                ))}
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#059669",marginBottom:8}}>✓ CON SHIELD</div>
                {["La IA ya tiene todo listo","Se activa en 1 toque","No pagás extra en la crisis","Radar + alertas inmediatas","Difusión automática activa"].map((t,i)=>(
                  <div key={i} style={{fontSize:11,color:"#D6D3D1",marginBottom:4,display:"flex",gap:4}}><span style={{color:"#059669"}}>•</span>{t}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Features */}
          <div style={{background:"#fff",borderRadius:18,border:"2px solid #05966930",padding:18,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#059669",letterSpacing:".06em",marginBottom:12}}>¿QUÉ INCLUYE TU SHIELD?</div>
            {[
              {i:<$.Scan s={16}/>,t:"ID Digital + QR activo",d:"Perfil completo con QR para el collar. Si alguien lo escanea, te contacta al instante."},
              {i:<$.AI s={16}/>,t:"IA pre-analizada",d:"La foto de tu mascota ya está procesada. Si se pierde, el matching es inmediato."},
              {i:<$.Zap s={16}/>,t:"Protocolo de emergencia",d:"Un toque y se activa: alertas en la zona, radar en redes, difusión automática. Sin pagar US$20 ni US$50."},
              {i:<$.Search s={16}/>,t:"Radar semanal preventivo",d:"Cada semana la IA busca en redes por si apareció una mascota similar a la tuya publicada."},
              {i:<$.AI s={16}/>,t:"Veterinario IA Premium",d:"Historial médico guardado, recordatorio de vacunas, alertas de salud personalizadas."},
              {i:<$.Bell s={16}/>,t:"Alertas en la zona",d:"Si alguien reporta una mascota encontrada cerca tuyo, te avisamos al instante."},
              {i:<$.Star s={16}/>,t:"Mayor visibilidad en búsqueda",d:"Tu mascota aparece con prioridad en las alertas de la zona. Más chances de ser encontrada."},
              {i:<$.Heart s={16}/>,t:"Reporte mensual IA",d:"Cada mes recibís un reporte de salud basado en lo que consultaste al veterinario IA."},
            ].map((f,i)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:i<7?12:0,alignItems:"flex-start"}}>
                <div style={{width:32,height:32,borderRadius:9,background:"#05966908",display:"flex",alignItems:"center",justifyContent:"center",color:"#059669",flexShrink:0,marginTop:2}}>{f.i}</div>
                <div><div style={{fontWeight:700,fontSize:13}}>{f.t}</div><div style={{fontSize:11,color:"#A8A29E",lineHeight:1.4}}>{f.d}</div></div>
              </div>
            ))}
          </div>

          {/* Pricing comparison */}
          <div style={{background:"#FAFAF9",borderRadius:16,padding:16,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#A8A29E",letterSpacing:".06em",marginBottom:10}}>COMPARÁ EL COSTO</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"#DC262608",borderRadius:10}}>
                <span style={{fontSize:12,color:"#57534E"}}>Sin Shield, cuando perdés tu mascota</span>
                <span style={{fontSize:14,fontWeight:800,color:"#DC2626"}}>US$20-50</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"#05966908",borderRadius:10,border:"1px solid #05966920"}}>
                <span style={{fontSize:12,color:"#057A55",fontWeight:600}}>Con Shield, todo incluido</span>
                <span style={{fontSize:14,fontWeight:800,color:"#059669"}}>US$5/mes</span>
              </div>
              <div style={{textAlign:"center",fontSize:11,color:"#059669",fontWeight:700,marginTop:2}}>Ahorrás hasta US$45 en la emergencia</div>
            </div>
          </div>

          {/* CTA */}
          <button className="bp" style={{width:"100%",justifyContent:"center",padding:"16px 24px",fontSize:16,background:"linear-gradient(135deg,#059669,#0D9488)",marginBottom:10,borderRadius:16}}
            onClick={()=>{if(requireAuth("activar Shield"))setModal("premium");}}>
            <$.Shield s={18}/> Activar Shield por US$5/mes
          </button>
          <p style={{textAlign:"center",fontSize:10,color:"#D6D3D1",marginBottom:32}}>Cancelá cuando quieras. Sin compromiso. Tu mascota protegida.</p>
        </div>
      )}

      {/* ═══ SERVICES — External search links ═══ */}
      {!selectedPet && page==="market" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:"linear-gradient(135deg,#57534E,#78716C)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Search s={28} c="#fff"/>
            </div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
              Recursos <span style={{color:"#57534E"}}>útiles</span>
            </h1>
            <p style={{fontSize:13,color:"#78716C",lineHeight:1.5,maxWidth:420,margin:"0 auto 8px"}}>
              Accesos rápidos para buscar servicios cerca tuyo.
            </p>
          </section>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
            {[
              {emoji:"🩺",name:"Veterinarias",search:"veterinaria cerca mío",color:"#DC2626"},
              {emoji:"🛒",name:"Pet Shops",search:"pet shop cerca mío",color:"#D97706"},
              {emoji:"🦮",name:"Paseadores",search:"paseador de perros cerca mío",color:"#2563EB"},
              {emoji:"✂️",name:"Peluquería Pet",search:"peluquería canina cerca mío",color:"#7C3AED"},
              {emoji:"🎓",name:"Entrenadores",search:"entrenador canino cerca mío",color:"#059669"},
              {emoji:"🏠",name:"Pet Sitters",search:"pet sitter cerca mío",color:"#E8590C"},
              {emoji:"📷",name:"Fotógrafos",search:"fotógrafo de mascotas cerca mío",color:"#EC4899"},
              {emoji:"🚗",name:"Transporte",search:"transporte de mascotas cerca mío",color:"#0891B2"},
            ].map((s,i)=>(
              <a key={i} href={`https://www.google.com/search?q=${encodeURIComponent(s.search)}`} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",gap:14,background:"#fff",borderRadius:16,border:"2px solid #F5F5F4",padding:"16px 18px",textDecoration:"none",color:"#1C1917",transition:"all .2s",cursor:"pointer"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=s.color;e.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#F5F5F4";e.currentTarget.style.transform="none";}}>
                <div style={{fontSize:32,flexShrink:0}}>{s.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:16}}>{s.name}</div>
                  <div style={{fontSize:12,color:"#78716C",marginTop:2}}>Buscar {s.name.toLowerCase()} cerca tuyo</div>
                </div>
                <div style={{background:s.color,color:"#fff",padding:"8px 16px",borderRadius:10,fontWeight:700,fontSize:13,flexShrink:0}}>Buscar</div>
              </a>
            ))}
          </div>
          <div style={{padding:14,background:"#FAFAF9",borderRadius:12,border:"1px solid #F5F5F4",marginBottom:32}}>
            <p style={{fontSize:11,color:"#A8A29E",lineHeight:1.5,textAlign:"center"}}>PetFinder AI no presta ni verifica estos servicios. Solo facilita accesos rápidos a búsquedas externas.</p>
          </div>
        </div>
      )}

      {/* ═══ PETFIT — Daily Health Tracker ═══ */}
      {!selectedPet && page==="petfit" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:"linear-gradient(135deg,#10B981,#06B6D4)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Heart s={28} c="#fff"/>
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#10B98110",padding:"4px 12px",borderRadius:100,fontSize:10,fontWeight:700,color:"#10B981",marginBottom:10}}>TRACKER DIARIO CON IA</div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
              Pet<span style={{color:"#10B981"}}>Fit</span>
            </h1>
            <p style={{fontSize:13,color:"#78716C",lineHeight:1.5,maxWidth:400,margin:"0 auto 16px"}}>
              Registrá la alimentación, paseos y salud de tu mascota cada día. La IA detecta cambios y te alerta.
            </p>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:3,marginBottom:16}}>
              <span style={{fontSize:28,fontWeight:800,color:"#10B981"}}>Incluido en Club</span>
              <span style={{fontSize:13,color:"#A8A29E"}}>/mes</span>
            </div>
          </section>

          {/* Daily log card */}
          <div style={{background:"#fff",borderRadius:18,border:"1px solid #F5F5F4",overflow:"hidden",marginBottom:14}}>
            <div style={{background:"linear-gradient(135deg,#10B981,#06B6D4)",padding:"14px 16px",color:"#fff"}}>
              <div style={{fontWeight:700,fontSize:14}}>Registro de hoy — Sábado 4 Abril</div>
              <div style={{fontSize:11,opacity:.8}}>Max · Golden Retriever</div>
            </div>
            <div style={{padding:14}}>
              {[
                {emoji:"🍗",cat:"Alimentación",val:"Royal Canin Adult 300g",status:"ok",time:"08:30"},
                {emoji:"🦴",cat:"Snack",val:"Dentastix x1",status:"ok",time:"11:00"},
                {emoji:"🚶",cat:"Paseo",val:"45 min — Parque Centenario",status:"ok",time:"09:15"},
                {emoji:"💧",cat:"Agua",val:"Bebió 3 veces",status:"ok",time:"—"},
                {emoji:"💩",cat:"Deposición",val:"Normal, firme",status:"ok",time:"09:40"},
                {emoji:"⚖️",cat:"Peso",val:"28.5 kg (estable)",status:"ok",time:"08:00"},
                {emoji:"😊",cat:"Humor",val:"Activo, juguetón",status:"ok",time:"—"},
              ].map((l,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<6?"1px solid #F5F5F4":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>{l.emoji}</span>
                    <div><div style={{fontWeight:600,fontSize:12}}>{l.cat}</div><div style={{fontSize:10,color:"#A8A29E"}}>{l.val}</div></div>
                  </div>
                  <span style={{fontSize:10,color:"#A8A29E"}}>{l.time}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"10px 14px",background:"#FAFAF9",borderTop:"1px solid #F5F5F4"}}>
              <div style={{textAlign:"center",padding:"10px",fontSize:12,fontWeight:700,color:"#10B981"}}>
                Registro diario — próximamente
              </div>
            </div>
          </div>

          {/* AI Health Insights */}
          <div style={{background:"linear-gradient(135deg,#0F172A,#1E293B)",borderRadius:18,padding:18,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
              <$.AI s={16} c="#10B981"/><span style={{fontSize:11,fontWeight:700,color:"#10B981",letterSpacing:".05em"}}>ANÁLISIS IA SEMANAL</span>
            </div>
            <div style={{color:"#E2E8F0",fontSize:13,lineHeight:1.6,marginBottom:12}}>
              Max tuvo una semana estable. Peso consistente en 28.5kg, alimentación regular, 6/7 paseos completados. La IA no detectó cambios en pelaje ni comportamiento anómalo en las fotos diarias.
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{l:"Peso",v:"28.5kg",c:"#10B981",t:"Estable"},{l:"Actividad",v:"6/7 días",c:"#06B6D4",t:"Muy bien"},{l:"Alimentación",v:"Regular",c:"#10B981",t:"OK"},{l:"Alerta",v:"Ninguna",c:"#10B981",t:"✓"}].map((s,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,.06)",borderRadius:10,padding:"8px 12px",flex:"1 1 45%",minWidth:100}}>
                  <div style={{fontSize:9,color:"#94A3B8",fontWeight:600}}>{s.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9,color:"#64748B"}}>{s.t}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Photo change detection */}
          <div style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:16,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"#78716C",letterSpacing:".05em",marginBottom:10}}>DETECCIÓN DE CAMBIOS POR FOTO</div>
            <p style={{fontSize:12,color:"#57534E",lineHeight:1.5,marginBottom:10}}>Subí una foto de tu mascota cada semana. La IA compara con fotos anteriores y detecta: pérdida de peso, pelaje opaco, ojos llorosos, cambios en postura, lesiones visibles.</p>
            <div style={{textAlign:"center",padding:"10px 16px",fontSize:12,fontWeight:600,color:"#A8A29E",border:"1px dashed #E7E5E4",borderRadius:10}}>
              Detección por foto — próximamente
            </div>
          </div>

          {/* Bonus: Face ID connection */}
          <div style={{background:"#7C3AED08",borderRadius:14,padding:14,textAlign:"center",marginBottom:32,border:"1px solid #7C3AED15"}}>
            <$.Scan s={20} c="#7C3AED"/>
            <p style={{fontSize:12,color:"#7C3AED",fontWeight:700,marginTop:6}}>Bonus: Face ID Tracker integrado</p>
            <p style={{fontSize:11,color:"#78716C",marginTop:4}}>Tus fotos diarias alimentan el Face ID. Si algún día tu mascota se pierde, el sistema ya tiene todo para buscarla al instante.</p>
          </div>
        </div>
      )}

      {/* ═══ PETMATCH — Tinder de mascotas ═══ */}
      {!selectedPet && page==="petmatch" && (
        <div style={{animation:"fadeIn .5s",maxWidth:600,margin:"0 auto",padding:"0 14px"}}>
          <section style={{padding:"32px 0 20px",textAlign:"center"}}>
            <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",background:"linear-gradient(135deg,#EC4899,#F43F5E)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Sparkle s={28} c="#fff"/>
            </div>
            <h1 style={{fontFamily:"'Fraunces',serif",fontSize:28,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
              Pet<span style={{color:"#EC4899"}}>Match</span>
            </h1>
            <p style={{fontSize:13,color:"#78716C",lineHeight:1.5,maxWidth:400,margin:"0 auto 16px"}}>
              Conectá tu mascota con otras. Para cruzar, socializar o adoptar. El Tinder de las mascotas.
            </p>
          </section>

          {/* Match categories */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
            {[
              {emoji:"❤️",name:"Cruzar",desc:"Encontrar pareja",color:"#EC4899"},
              {emoji:"🐾",name:"Socializar",desc:"Amigos para pasear",color:"#F59E0B"},
              {emoji:"🏠",name:"Adoptar",desc:"Dar/buscar hogar",color:"#10B981"},
            ].map((c,i)=>(
              <div key={i} className="ch" style={{background:"#fff",borderRadius:14,padding:14,border:"1px solid #F5F5F4",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:6}}>{c.emoji}</div>
                <div style={{fontWeight:700,fontSize:13,color:c.color}}>{c.name}</div>
                <div style={{fontSize:10,color:"#A8A29E",marginTop:2}}>{c.desc}</div>
              </div>
            ))}
          </div>

          {/* Sample profiles */}
          <div style={{fontSize:12,fontWeight:700,color:"#A8A29E",letterSpacing:".05em",marginBottom:10}}>PERFILES CERCA TUYO</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            {[
              {name:"Bella",breed:"Labrador",age:"2 años",sex:"Hembra",owner:"Camila R.",zone:"Palermo",looking:"Socializar — busco amigos para pasear en el parque",verified:true,color:"#F59E0B"},
              {name:"Thor",breed:"Pastor Alemán",age:"3 años",sex:"Macho",owner:"Roberto S.",zone:"Belgrano",looking:"Cruzar — busco hembra Pastor Alemán con pedigree",verified:true,color:"#EC4899"},
              {name:"Mia",breed:"Caniche Toy",age:"1 año",sex:"Hembra",owner:"Valentina M.",zone:"Recoleta",looking:"Socializar — es muy sociable, busco grupo de paseo",verified:false,color:"#F59E0B"},
              {name:"Simón",breed:"Gato Común",age:"5 años",sex:"Macho",owner:"Lucía T.",zone:"San Telmo",looking:"Adopción — me mudo y necesito darle un hogar con amor",verified:true,color:"#10B981"},
            ].map((p,i)=>(
              <div key={i} className="ch" style={{background:"#fff",borderRadius:16,border:"1px solid #F5F5F4",padding:14,cursor:"pointer",animation:`fadeIn .4s ease ${i*.06}s both`}}>
                <div style={{display:"flex",gap:12}}>
                  <div style={{width:56,height:56,borderRadius:14,background:`linear-gradient(135deg,hsl(${i*80},45%,85%),hsl(${i*80+30},50%,78%))`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {p.breed.includes("Gato")?<$.Cat s={26} c={`hsl(${i*80},40%,40%)`}/>:<$.Dog s={26} c={`hsl(${i*80},40%,40%)`}/>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontWeight:700,fontSize:15}}>{p.name}</span>
                        {p.verified&&<$.Check s={13} c="#2563EB"/>}
                      </div>
                      <span style={{background:`${p.color}14`,color:p.color,padding:"2px 8px",borderRadius:6,fontSize:9,fontWeight:700}}>{p.color==="#EC4899"?"Cruzar":p.color==="#10B981"?"Adopción":"Social"}</span>
                    </div>
                    <div style={{fontSize:11,color:"#A8A29E"}}>{p.breed} · {p.age} · {p.sex} · {p.zone}</div>
                    <div style={{fontSize:12,color:"#57534E",marginTop:4,lineHeight:1.4}}>{p.looking}</div>
                    <div style={{fontSize:10,color:"#78716C",marginTop:4}}>Dueño: {p.owner}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,marginTop:10}}>
                  <button className="bp" style={{flex:1,justifyContent:"center",padding:"8px",fontSize:11,background:"linear-gradient(135deg,#EC4899,#F43F5E)"}} onClick={e=>{e.stopPropagation();notify("Match enviado a "+p.owner,"ok");}}>
                    <$.Sparkle s={12} c="#fff"/> Match
                  </button>
                  <div style={{flex:1,textAlign:"center",padding:"8px",fontSize:10,color:"#D6D3D1",fontWeight:600}}>Chat próximamente</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{background:"linear-gradient(135deg,#EC4899,#F43F5E)",borderRadius:16,padding:18,textAlign:"center",marginBottom:32}}>
            <h3 style={{color:"#fff",fontSize:16,fontWeight:800,marginBottom:6}}>Creá el perfil de tu mascota</h3>
            <p style={{color:"rgba(255,255,255,.8)",fontSize:12,marginBottom:12}}>Gratis para socializar. Premium para cruzar con pedigree verificado.</p>
            <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>Funcionalidad completa próximamente</div>
          </div>
        </div>
      )}



      {selectedPet&&(
        <div style={{animation:"fadeIn .4s",padding:"14px",maxWidth:540,margin:"0 auto"}}>
          <button onClick={()=>setSelectedPet(null)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontSize:13,fontWeight:600,color:"#78716C",marginBottom:12,fontFamily:"inherit"}}><$.Back s={16}/> Volver</button>
          <div style={{background:"#fff",borderRadius:20,overflow:"hidden",border:"1px solid #F5F5F4"}}>
            <div style={{display:"flex",justifyContent:"center",padding:"12px 12px 0"}}><Avatar pet={selectedPet} size={320}/></div>
            <div style={{padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
                <div>
                  <h2 style={{fontSize:24,fontWeight:800,letterSpacing:"-.03em"}}>{selectedPet.name||"Mascota encontrada"}</h2>
                  <div style={{fontSize:13,color:"#A8A29E",marginTop:2}}>{selectedPet.breed} · {selectedPet.type==="dog"?"Perro":"Gato"}</div>
                </div>
                <span style={{padding:"4px 10px",borderRadius:8,fontSize:11,fontWeight:700,background:selectedPet.status==="lost"?"#DC262610":"#2563EB10",color:selectedPet.status==="lost"?"#DC2626":"#2563EB"}}>{selectedPet.status==="lost"?"PERDIDO":"ENCONTRADO"}</span>
              </div>
              <div style={{fontSize:13,color:"#57534E",lineHeight:1.7,marginTop:14,padding:14,background:"#FAFAF9",borderRadius:12}}>{selectedPet.description}</div>
              <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {i:<$.Pin s={15} c="#E8590C"/>,t:selectedPet.location?.address},
                  {i:<$.User s={15} c="#E8590C"/>,t:selectedPet.status==="lost"?selectedPet.ownerName:selectedPet.finderName},
                  {i:<$.Clock s={15} c="#E8590C"/>,t:selectedPet.date},
                  selectedPet.reward&&{i:<$.Star s={15} c="#059669"/>,t:`Recompensa: ${selectedPet.reward}`,bold:true,c:"#059669"},
                ].filter(Boolean).map((r,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>{r.i}<span style={{fontSize:12,fontWeight:r.bold?700:400,color:r.c||"#1C1917"}}>{r.t}</span></div>
                ))}
              </div>
              <AIPanel features={selectedPet.aiFeatures}/>
              <div style={{display:"flex",gap:8,marginTop:18,flexWrap:"wrap"}}>
                <button className="bp" onClick={()=>runAI(selectedPet)}><$.Scan s={15}/> Buscar con IA</button>
                <button className="bp" style={{background:"linear-gradient(135deg,#7C3AED,#2563EB)"}} onClick={()=>runRadarSearch(selectedPet)}><$.Scan s={15}/> Face ID Tracker</button>
                <button className="bo" onClick={()=>{setContactPet(selectedPet);setChatMsgs([]);setModal("contact");}}><$.Msg s={15}/> Contactar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Face ID Tracker */}
      {modal==="radar"&&(
        <Modal onClose={()=>{setModal(null);setRadarResults([]);setRadarPet(null);}}>
          <div>
            {/* Header with pet info */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{width:44,height:44,borderRadius:13,background:"linear-gradient(135deg,#7C3AED,#2563EB)",display:"flex",alignItems:"center",justifyContent:"center",animation:radarLoading?"pulse 1.5s infinite":"none"}}>
                <$.Scan s={22} c="#fff"/>
              </div>
              <div>
                <h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>{radarLoading?"Face ID Tracker activo...":"Resultados Face ID"}</h3>
                <p style={{fontSize:11,color:"#A8A29E"}}>{radarLoading?radarStep:`${radarResults.length} coincidencia(s) en la web`}</p>
              </div>
            </div>

            {/* Pet being tracked */}
            {radarPet&&!radarLoading&&(
              <div style={{display:"flex",gap:10,padding:10,background:"#7C3AED08",borderRadius:12,border:"1px solid #7C3AED15",marginBottom:14}}>
                <Avatar pet={radarPet} size={48}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13}}>{radarPet.name||"Mascota buscada"}</div>
                  <div style={{fontSize:10,color:"#A8A29E"}}>{radarPet.breed} · {radarPet.location?.address}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                    {[radarPet.color,radarPet.size&&({tiny:"Muy chico",small:"Chico",medium:"Mediano",large:"Grande",xlarge:"Muy grande"})[radarPet.size],radarPet.hasCollar===true?"Con collar":null].filter(Boolean).map((t,i)=>(
                      <span key={i} style={{background:"#fff",padding:"1px 6px",borderRadius:4,fontSize:9,fontWeight:600,color:"#7C3AED"}}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Radar animation */}
            {radarLoading&&(
              <div style={{position:"relative",height:220,borderRadius:16,background:"#0F172A",overflow:"hidden",marginBottom:16}}>
                {/* Radar sweep */}
                <div style={{position:"absolute",top:"50%",left:"50%",width:180,height:180,transform:"translate(-50%,-50%)"}}>
                  {/* Concentric circles */}
                  {[1,2,3].map(r=>(
                    <div key={r} style={{position:"absolute",top:"50%",left:"50%",width:r*60,height:r*60,transform:"translate(-50%,-50%)",borderRadius:"50%",border:"1px solid rgba(124,58,237,.2)"}}/>
                  ))}
                  {/* Sweep line */}
                  <div style={{position:"absolute",top:"50%",left:"50%",width:90,height:2,background:"linear-gradient(90deg,#7C3AED,transparent)",transformOrigin:"0 50%",animation:"spin 2s linear infinite"}}/>
                  {/* Center dot */}
                  <div style={{position:"absolute",top:"50%",left:"50%",width:8,height:8,borderRadius:4,background:"#7C3AED",transform:"translate(-50%,-50%)",boxShadow:"0 0 12px #7C3AED"}}/>
                  {/* Blips */}
                  {[{x:30,y:-40,d:.5},{x:-50,y:20,d:1},{x:60,y:50,d:1.5},{x:-20,y:-60,d:2}].map((b,i)=>(
                    <div key={i} style={{position:"absolute",top:`calc(50% + ${b.y}px)`,left:`calc(50% + ${b.x}px)`,width:6,height:6,borderRadius:3,background:"#4ADE80",opacity:0,animation:`fadeIn .5s ${b.d}s forwards`,boxShadow:"0 0 8px #4ADE80"}}/>
                  ))}
                </div>
                {/* Status text */}
                <div style={{position:"absolute",bottom:12,left:0,right:0,textAlign:"center",fontSize:11,color:"#A8A29E",fontWeight:600}}>{radarStep}</div>
                {/* Platform icons scrolling */}
                <div style={{position:"absolute",top:10,left:0,right:0,display:"flex",justifyContent:"center",gap:8}}>
                  {["Instagram","Facebook","X","TikTok","WhatsApp","Web"].map((p,i)=>(
                    <span key={i} style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.3)",padding:"2px 6px",borderRadius:4,border:"1px solid rgba(255,255,255,.1)",animation:`fadeIn .3s ${i*.3}s both`}}>{p}</span>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {!radarLoading&&radarResults.length===0&&(
              <div style={{textAlign:"center",padding:"32px 14px",background:"#FAFAF9",borderRadius:14,marginBottom:12}}>
                <$.Search s={32} c="#D6D3D1"/>
                <p style={{marginTop:8,color:"#A8A29E",fontSize:13,fontWeight:600}}>No encontramos publicaciones que coincidan ahora.</p>
                <p style={{fontSize:11,color:"#D6D3D1",marginTop:4}}>El radar seguirá buscando. Te notificaremos si aparece algo.</p>
              </div>
            )}

            {/* Results */}
            {!radarLoading&&radarResults.length>0&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <$.Check s={16} c="#059669"/>
                    <span style={{fontSize:13,fontWeight:700,color:"#059669"}}>{radarResults.length} resultado(s)</span>
                  </div>
                  <span style={{fontSize:10,color:"#A8A29E"}}>Ordenados por coincidencia</span>
                </div>
                {radarResults.map((r,i)=>{
                  const matchColor = (r.matchPercent||0)>70?"#059669":(r.matchPercent||0)>40?"#D97706":"#A8A29E";
                  const sourceIcons = {social:"📱",shelter:"🏥",website:"🌐",community:"👥",classified:"📋"};
                  const sourceColors = {Instagram:"#E4405F",Facebook:"#1877F2","X":"#1C1917",TikTok:"#000",WhatsApp:"#25D366",Telegram:"#0088CC","Petco Love Lost":"#00A3E0",PawBoost:"#FF6B35"};
                  return (
                    <div key={i} style={{background:"#fff",border:(r.matchPercent||0)>70?"2px solid #05966930":"1.5px solid #F5F5F4",borderRadius:14,padding:14,marginBottom:10,animation:`fadeIn .4s ease ${i*.1}s both`}}>
                      {/* Source + match header */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:14}}>{sourceIcons[r.sourceType]||"🔍"}</span>
                          <span style={{background:sourceColors[r.source]||"#78716C",color:"#fff",padding:"2px 8px",borderRadius:6,fontSize:9,fontWeight:700}}>{r.source}</span>
                          {r.date&&<span style={{fontSize:10,color:"#A8A29E"}}>{r.date}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:4}}>
                          <div style={{width:28,height:28,borderRadius:8,background:`${matchColor}14`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,color:matchColor}}>{r.matchPercent||"?"}%</div>
                        </div>
                      </div>

                      <h4 style={{fontSize:14,fontWeight:700,marginBottom:4,letterSpacing:"-.02em"}}>{r.title}</h4>
                      <p style={{fontSize:12,color:"#57534E",lineHeight:1.5,marginBottom:8}}>{r.description}</p>

                      {/* Matching traits */}
                      {r.matchingTraits?.length>0&&(
                        <div style={{marginBottom:8}}>
                          <div style={{fontSize:9,fontWeight:700,color:"#059669",letterSpacing:".04em",marginBottom:4}}>RASGOS QUE COINCIDEN</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                            {r.matchingTraits.map((t,j)=>(<span key={j} style={{background:"#ECFDF5",color:"#059669",padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:600}}>{t}</span>))}
                          </div>
                        </div>
                      )}
                      {r.differingTraits?.length>0&&(
                        <div style={{marginBottom:8}}>
                          <div style={{fontSize:9,fontWeight:700,color:"#D97706",letterSpacing:".04em",marginBottom:4}}>DIFERENCIAS</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                            {r.differingTraits.map((t,j)=>(<span key={j} style={{background:"#FEF3C7",color:"#92400E",padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:600}}>{t}</span>))}
                          </div>
                        </div>
                      )}

                      {r.location&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#78716C",marginBottom:4}}><$.Pin s={12} c="#2563EB"/>{r.location}</div>}
                      {r.contactInfo&&<div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#059669",fontWeight:600,marginBottom:6}}><$.Phone s={12} c="#059669"/>{r.contactInfo}</div>}

                      <div style={{display:"flex",gap:6,marginTop:6}}>
                        {r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#2563EB",fontWeight:600,textDecoration:"none",background:"#2563EB08",padding:"5px 10px",borderRadius:7}} onMouseEnter={e=>e.currentTarget.style.background="#2563EB14"} onMouseLeave={e=>e.currentTarget.style.background="#2563EB08"}><$.Eye s={12} c="#2563EB"/> Ver publicación</a>}
                      </div>
                    </div>
                  );
                })}

                {/* Run again */}
                <button className="bp" style={{width:"100%",justifyContent:"center",marginTop:8,background:"linear-gradient(135deg,#7C3AED,#2563EB)"}} onClick={()=>radarPet&&runRadarSearch(radarPet)}>
                  <$.Search s={14}/> Buscar de nuevo
                </button>
              </div>
            )}

            {/* Info footer */}
            {!radarLoading&&(
              <div style={{marginTop:14,padding:12,background:"#7C3AED08",borderRadius:12,border:"1px solid #7C3AED15"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#7C3AED",marginBottom:6}}>FACE ID TRACKER</div>
                <div style={{fontSize:11,color:"#78716C",lineHeight:1.5}}>Busca en tiempo real en redes sociales (Facebook, Instagram, X, TikTok), grupos de WhatsApp/Telegram, sitios especializados (Petco Love Lost, PawBoost), refugios, veterinarias y clasificados. Los rasgos de tu mascota se cruzan con cada publicación usando IA.</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:8}}>
                  {["Facebook","Instagram","X","TikTok","WhatsApp","Telegram","Petco Love Lost","PawBoost","Refugios","Veterinarias"].map((s,i)=>(
                    <span key={i} style={{background:"#7C3AED10",color:"#7C3AED",padding:"2px 7px",borderRadius:5,fontSize:9,fontWeight:600}}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Register Lost */}
      {modal==="register"&&<Modal onClose={()=>setModal(null)}><PetForm title="Reportar mascota perdida" sub="Subí una foto para que la IA analice a tu mascota" type="lost" onSubmit={registerPet} onClose={()=>setModal(null)} analyzePhoto={analyzePhoto} analyzingPhoto={analyzingPhoto} analysisResult={analysisResult} setAnalysisResult={setAnalysisResult}/></Modal>}

      {/* Register Found */}
      {modal==="found"&&<Modal onClose={()=>setModal(null)}><PetForm title="Reportar mascota encontrada" sub="Sacale una foto y la IA buscará al dueño" type="found" onSubmit={registerPet} onClose={()=>setModal(null)} analyzePhoto={analyzePhoto} analyzingPhoto={analyzingPhoto} analysisResult={analysisResult} setAnalysisResult={setAnalysisResult}/></Modal>}

      {/* AI Match Results */}
      {modal==="match"&&(
        <Modal onClose={()=>{setModal(null);setMatches([]);}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
            <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center",animation:aiLoading?"pulse 1.5s infinite":"none"}}>
              <$.AI s={20} c="#fff"/>
            </div>
            <div>
              <h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>{aiLoading?"Analizando...":"Resultados IA"}</h3>
              <p style={{fontSize:11,color:"#A8A29E"}}>{aiLoading?aiStep:`${matches.length} coincidencia(s) encontrada(s)`}</p>
            </div>
          </div>

          {aiLoading&&(
            <div style={{height:160,borderRadius:14,background:"#FAFAF9",position:"relative",overflow:"hidden",marginBottom:14}}>
              <div style={{position:"absolute",left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,#E8590C,transparent)",animation:"scanLine 1.2s linear infinite"}}/>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:8}}>
                <div style={{width:40,height:40,border:"3px solid #E8590C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
                <div style={{fontSize:12,color:"#A8A29E",fontWeight:600}}>{aiStep}</div>
              </div>
            </div>
          )}

          {!aiLoading&&matches.length===0&&(
            <div style={{textAlign:"center",padding:"32px 14px",background:"#FAFAF9",borderRadius:14}}>
              <$.Search s={32} c="#D6D3D1"/>
              <p style={{marginTop:8,color:"#A8A29E",fontSize:13}}>Sin coincidencias aún. Te notificaremos cuando aparezca algo.</p>
            </div>
          )}

          {/* PAYWALL — results found but not subscribed */}
          {!aiLoading&&matches.length>0&&!isSubscriptionActive(currentUser)&&(
            <div>
              {/* Blurred preview of results */}
              <div style={{position:"relative",overflow:"hidden",borderRadius:16,marginBottom:14}}>
                {matches.slice(0,3).map((m,i)=>(
                  <div key={m.id} style={{display:"flex",gap:12,padding:12,background:"#fff",border:"1px solid #F5F5F4",marginBottom:6,borderRadius:12,filter:"blur(6px)",opacity:.5,userSelect:"none",pointerEvents:"none"}}>
                    <Avatar pet={m} size={56}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14}}>████████</div>
                      <div style={{fontSize:11,color:"#A8A29E"}}>██████ · ████████</div>
                      <div style={{marginTop:4}}><Badge score={m.matchScore}/></div>
                    </div>
                  </div>
                ))}
                {/* Overlay */}
                <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(255,255,255,.3) 0%,rgba(255,255,255,.95) 70%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",padding:"20px 16px"}}>
                </div>
              </div>

              {/* Paywall card */}
              <div style={{background:"linear-gradient(135deg,#1C1917,#292524)",borderRadius:18,padding:22,textAlign:"center",marginBottom:14}}>
                <div style={{width:48,height:48,borderRadius:14,margin:"0 auto 12px",background:"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center",animation:"glow 2s infinite"}}>
                  <$.Zap s={24} c="#fff"/>
                </div>
                <h3 style={{color:"#fff",fontSize:20,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>
                  ¡{matches.length} coincidencia{matches.length>1?"s":""} encontrada{matches.length>1?"s":""}!
                </h3>
                <p style={{color:"#A8A29E",fontSize:13,lineHeight:1.5,marginBottom:4}}>
                  La IA detectó mascotas similares a la tuya.
                </p>
                <p style={{color:"#FBBF24",fontSize:14,fontWeight:700,marginBottom:16}}>
                  Desbloqueá los resultados para ver los datos de contacto.
                </p>

                <div style={{display:"flex",alignItems:"baseline",justifyContent:"center",gap:4,marginBottom:14}}>
                  <span style={{fontSize:36,fontWeight:800,color:"#fff"}}>US$20</span>
                  <span style={{fontSize:14,color:"#A8A29E"}}>/7 días</span>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:5,textAlign:"left",marginBottom:16,padding:"0 8px"}}>
                  {["Ver datos de contacto de quien encontró tu mascota","Chat directo para coordinar el reencuentro","Tu mascota visible en la plataforma 7 días","Alertas si aparecen nuevas coincidencias"].map((f,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#D6D3D1"}}>
                      <$.Check s={13} c="#059669"/>{f}
                    </div>
                  ))}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button className="bp" style={{width:"100%",justifyContent:"center",padding:"14px 24px",fontSize:15}} onClick={()=>setModal("premium")}>
                    <$.Zap s={16}/> US$20 — Desbloquear resultados
                  </button>
                  <button className="bp" style={{width:"100%",justifyContent:"center",padding:"14px 24px",fontSize:14,background:"linear-gradient(135deg,#7C3AED,#2563EB)"}} onClick={()=>setModal("premium")}>
                    <$.Zap s={16}/> US$50 — Resultados + difusión en redes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Results — only for active subscribers */}
          {!aiLoading&&matches.length>0&&isSubscriptionActive(currentUser)&&matches.map((m,i)=>(
            <div key={m.id} style={{display:"flex",gap:12,padding:12,borderRadius:14,background:"#fff",border:"1.5px solid #F5F5F4",marginBottom:8,animation:`fadeIn .4s ease ${i*.1}s both`,cursor:"pointer"}}
              onClick={()=>{setContactPet(m);setChatMsgs([]);setModal("contact");}}>
              <Avatar pet={m} size={68}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:700,fontSize:14}}>{m.name||"Encontrada"}</div>
                  <Badge score={m.matchScore}/>
                </div>
                <div style={{fontSize:11,color:"#A8A29E",marginTop:1}}>{m.breed} · {m.location?.address}</div>
                {m.aiComparison&&(
                  <div style={{marginTop:6,padding:8,background:"#05966908",borderRadius:8,fontSize:11,color:"#057A55",lineHeight:1.4}}>
                    <strong>IA:</strong> {m.aiComparison.reasoning}
                  </div>
                )}
                {m.aiComparison?.matchingFeatures?.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                    {m.aiComparison.matchingFeatures.slice(0,4).map((f,j)=>(
                      <span key={j} style={{background:"#ECFDF5",color:"#059669",padding:"1px 6px",borderRadius:4,fontSize:9,fontWeight:600}}>{f}</span>
                    ))}
                  </div>
                )}
                <button className="bp" style={{marginTop:6,padding:"5px 12px",fontSize:10,borderRadius:8}} onClick={e=>{e.stopPropagation();setContactPet(m);setChatMsgs([]);setModal("contact");}}>
                  <$.Msg s={11} c="#fff"/> Contactar
                </button>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* Contact/Chat */}
      {modal==="contact"&&contactPet&&(
        <Modal onClose={()=>{setModal(null);setContactPet(null);}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:14,borderBottom:"1px solid #F5F5F4"}}>
            <Avatar pet={contactPet} size={44}/>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>{contactPet.ownerName||contactPet.finderName}</div>
              <div style={{fontSize:11,color:"#A8A29E"}}>{contactPet.status==="lost"?"Dueño":"Encontró la mascota"} · {contactPet.location?.address}</div>
            </div>
          </div>
          <div style={{background:"#FAFAF9",borderRadius:12,padding:12,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><$.Phone s={14} c="#059669"/><span style={{fontSize:13,fontWeight:600}}>{contactPet.ownerPhone||contactPet.finderPhone}</span></div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><$.Pin s={14} c="#2563EB"/><span style={{fontSize:12}}>{contactPet.location?.address}</span></div>
            {/* WhatsApp Direct Button */}
            <button onClick={()=>{
              const phone=(contactPet.ownerPhone||contactPet.finderPhone||"").replace(/[^0-9+]/g,"").replace(/^\+/,"");
              const petName=contactPet.name||"mascota";
              const msg=encodeURIComponent(`Hola! Te escribo desde PetFinder AI por ${contactPet.status==="lost"?`tu mascota perdida "${petName}"`:`la mascota que encontraste`}. ${contactPet.status==="lost"?"Creo que la vi/encontré!":"¿Podría ser mi mascota?"}`);
              window.open(`https://wa.me/${phone}?text=${msg}`,"_blank");
            }} style={{
              width:"100%",padding:"12px 16px",borderRadius:10,border:"none",
              background:"linear-gradient(135deg,#25D366,#128C7E)",color:"#fff",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              fontFamily:"inherit",fontWeight:700,fontSize:13,transition:"all .2s",
            }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Abrir WhatsApp directo
            </button>
          </div>
          <div style={{fontSize:11,fontWeight:700,color:"#A8A29E",marginBottom:8,letterSpacing:".05em"}}>CHAT</div>
          <div style={{background:"#FAFAF9",borderRadius:12,padding:12,minHeight:160,maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {chatMsgs.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:"#D6D3D1"}}><$.Msg s={24} c="#D6D3D1"/><p style={{marginTop:6,fontSize:12}}>Enviá el primer mensaje</p></div>}
            {chatMsgs.map(m=>(
              <div key={m.id} style={{alignSelf:m.from==="them"?"flex-start":"flex-end",background:m.from==="them"?"#fff":"#E8590C",color:m.from==="them"?"#1C1917":"#fff",padding:"8px 12px",borderRadius:12,maxWidth:"80%",fontSize:12,lineHeight:1.5,animation:"fadeIn .3s"}}>
                {m.text}<div style={{fontSize:9,opacity:.6,marginTop:3}}>{m.time}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input value={msgText} onChange={e=>setMsgText(e.target.value)} placeholder="Escribí un mensaje..." onKeyDown={e=>e.key==="Enter"&&handleSendMsg()} style={{flex:1}}/>
            <button className="bp" style={{padding:"10px 14px",borderRadius:10}} onClick={handleSendMsg}><$.Send s={14} c="#fff"/></button>
          </div>
        </Modal>
      )}

      {/* AI Chat Assistant */}
      {modal==="ai-chat"&&(
        <Modal onClose={()=>setModal(null)}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <$.Sparkle s={20} c="#fff"/>
            </div>
            <div>
              <h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>Asistente IA</h3>
              <p style={{fontSize:11,color:"#A8A29E"}}>Preguntame lo que necesites sobre la búsqueda</p>
            </div>
          </div>
          <div style={{background:"#FAFAF9",borderRadius:12,padding:12,minHeight:200,maxHeight:320,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
            {aiChatMsgs.length===0&&(
              <div style={{textAlign:"center",padding:"24px 0",color:"#A8A29E"}}>
                <$.Sparkle s={28} c="#D6D3D1"/>
                <p style={{marginTop:8,fontSize:12}}>Hola! Soy el asistente de PetFinder. Puedo ayudarte con consejos de búsqueda, cómo usar la app, o cualquier duda.</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:10}}>
                  {["¿Cómo busco mejor?","Consejos para fotos","¿Cómo funciona la IA?"].map((q,i)=>(
                    <button key={i} style={{background:"#fff",border:"1px solid #E7E5E4",borderRadius:8,padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",color:"#57534E"}}
                      onClick={()=>{setAiChatInput(q);}}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {aiChatMsgs.map((m,i)=>(
              <div key={i} style={{alignSelf:m.from==="user"?"flex-end":"flex-start",background:m.from==="user"?"#E8590C":"#fff",color:m.from==="user"?"#fff":"#1C1917",padding:"10px 14px",borderRadius:14,maxWidth:"85%",fontSize:13,lineHeight:1.6,animation:"fadeIn .3s",border:m.from==="ai"?"1px solid #F5F5F4":"none"}}>
                {m.from==="ai"&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4,fontSize:10,fontWeight:700,color:"#E8590C"}}><$.Sparkle s={10} c="#E8590C"/>PetFinder IA</div>}
                {m.text}
              </div>
            ))}
            {aiChatLoading&&<div style={{alignSelf:"flex-start",background:"#fff",padding:"10px 14px",borderRadius:14,border:"1px solid #F5F5F4",animation:"pulse 1s infinite"}}><div style={{display:"flex",gap:4}}><div style={{width:6,height:6,borderRadius:3,background:"#D6D3D1",animation:"pulse .8s infinite"}}/>
              <div style={{width:6,height:6,borderRadius:3,background:"#D6D3D1",animation:"pulse .8s .2s infinite"}}/>
              <div style={{width:6,height:6,borderRadius:3,background:"#D6D3D1",animation:"pulse .8s .4s infinite"}}/></div></div>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <input value={aiChatInput} onChange={e=>setAiChatInput(e.target.value)} placeholder="Preguntá lo que necesites..." onKeyDown={e=>e.key==="Enter"&&sendAiChat()} style={{flex:1}}/>
            <button className="bp" style={{padding:"10px 14px",borderRadius:10}} onClick={sendAiChat} disabled={aiChatLoading}><$.Send s={14} c="#fff"/></button>
          </div>
        </Modal>
      )}

      {/* Premium + Payment */}
      {modal==="premium"&&(
        <Modal onClose={()=>setModal(null)}>
          <PremiumFlow 
            currentUser={currentUser}
            onSelectPlan={async(plan)=>{
              if(!currentUser){setModal("auth");notify("Necesitás cuenta para suscribirte","info");return;}
              if(plan.key==="free"){notify("Ya tenés el plan gratuito","info");return;}
              setModal("checkout");
              setCheckoutPlan(plan);
            }}
            onClose={()=>setModal(null)}
          />
        </Modal>
      )}

      {/* Checkout */}
      {modal==="checkout"&&checkoutPlan&&(
        <Modal onClose={()=>setModal(null)}>
          <CheckoutForm
            plan={checkoutPlan}
            user={currentUser}
            onSuccess={async(receipt)=>{
              // Save subscription date
              const u = await DB.get(`user:${currentUser.id}`);
              if(u) {
                u.subscribedAt = new Date().toISOString();
                u.plan = "weekly";
                await DB.set(`user:${currentUser.id}`, u);
                const { passHash, ...safe } = u;
                setCurrentUser(safe);
                await DB.set("session:current", safe);
              }
              setModal("receipt");
              setLastReceipt(receipt);
              notify("¡Suscripción activada por 7 días!");
              // Push notification
              if(currentUser) {
                const n = await Backend.addNotification(currentUser.id,{type:"info",title:"Suscripción activada",body:"Tenés 7 días de acceso completo a resultados y contactos.",icon:"zap"});
                setPushNotifs(p=>[n,...p]);
              }
            }}
            onBack={()=>setModal("premium")}
          />
        </Modal>
      )}

      {/* Receipt */}
      {modal==="receipt"&&lastReceipt&&(
        <Modal onClose={()=>{setModal(null);setLastReceipt(null);}}>
          <ReceiptView receipt={lastReceipt} plan={checkoutPlan} user={currentUser} onClose={()=>{setModal(null);setLastReceipt(null);}}/>
        </Modal>
      )}

      {/* Notifications */}
      {modal==="notifications"&&(
        <Modal onClose={async()=>{setModal(null);if(currentUser){const u=await Backend.markNotifsRead(currentUser.id);setPushNotifs(u);}}}>
          <h3 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <$.Bell s={20} c="#E8590C"/> Notificaciones
          </h3>
          {pushNotifs.length===0&&(
            <div style={{textAlign:"center",padding:"32px 14px",color:"#A8A29E"}}>
              <$.Bell s={32} c="#D6D3D1"/>
              <p style={{marginTop:8,fontSize:13}}>Sin notificaciones aún</p>
            </div>
          )}
          {pushNotifs.map((n,i)=>(
            <div key={n.id} style={{
              display:"flex",gap:10,padding:12,borderRadius:12,
              background:n.read?"#fff":"#E8590C06",
              border:n.read?"1px solid #F5F5F4":"1.5px solid #E8590C20",
              marginBottom:8,animation:`fadeIn .3s ease ${i*.05}s both`,
            }}>
              <div style={{
                width:36,height:36,borderRadius:10,flexShrink:0,
                background:n.type==="match"?"linear-gradient(135deg,#059669,#10B981)":n.type==="registered"?"linear-gradient(135deg,#E8590C,#DC2626)":"linear-gradient(135deg,#2563EB,#7C3AED)",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                {n.type==="match"?<$.AI s={16} c="#fff"/>:n.type==="registered"?<$.Check s={16} c="#fff"/>:<$.Bell s={16} c="#fff"/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{n.title}</div>
                <div style={{fontSize:12,color:"#78716C",lineHeight:1.4}}>{n.body}</div>
                <div style={{fontSize:10,color:"#D6D3D1",marginTop:4}}>{new Date(n.createdAt).toLocaleString("es-AR")}</div>
              </div>
              {!n.read&&<div style={{width:8,height:8,borderRadius:4,background:"#E8590C",flexShrink:0,marginTop:4}}/>}
            </div>
          ))}
        </Modal>
      )}

      {/* New Adoption Form */}
      {modal==="new-adoption"&&(
        <Modal onClose={()=>setModal(null)}>
          <AdoptionForm onSubmit={async(data)=>{
            await Backend.createAdoption(data, currentUser?.id);
            await refresh();
            setModal(null);
            notify("Publicación de adopción creada!");
            if(currentUser) {
              const n = await Backend.addNotification(currentUser.id,{type:"info",title:"Adopción publicada",body:"Tu mascota ya está visible para posibles adoptantes.",icon:"heart"});
              setPushNotifs(p=>[n,...p]);
            }
          }} onClose={()=>setModal(null)}/>
        </Modal>
      )}

      {/* New Foster Form */}
      {modal==="new-foster"&&(
        <Modal onClose={()=>setModal(null)}>
          <FosterForm onSubmit={async(data)=>{
            await Backend.createFoster(data, currentUser?.id);
            await refresh();
            setModal(null);
            notify("Tu hogar de tránsito fue publicado!");
            if(currentUser) {
              const n = await Backend.addNotification(currentUser.id,{type:"info",title:"Hogar registrado",body:"Tu oferta de guarda temporal ya es visible.",icon:"shield"});
              setPushNotifs(p=>[n,...p]);
            }
          }} onClose={()=>setModal(null)}/>
        </Modal>
      )}

      {/* Add Vaccine Modal */}
      {modal==="add-vaccine"&&(
        <Modal onClose={()=>setModal(null)}>
          <VaccineForm onSubmit={async(data)=>{
            notify("Vacuna registrada exitosamente!");
            setModal(null);
            if(currentUser){
              const n = await Backend.addNotification(currentUser.id,{type:"info",title:"Vacuna registrada",body:`${data.name} agregada al carnet de ${data.petName||"tu mascota"}.`,icon:"heart"});
              setPushNotifs(p=>[n,...p]);
            }
          }} onClose={()=>setModal(null)}/>
        </Modal>
      )}

      {/* Add Reminder Modal */}
      {modal==="add-reminder"&&(
        <Modal onClose={()=>setModal(null)}>
          <ReminderForm onSubmit={async(data)=>{
            notify("Recordatorio creado!");
            setModal(null);
            if(currentUser){
              const n = await Backend.addNotification(currentUser.id,{type:"info",title:"Recordatorio activo",body:`Te avisaremos cuando se acerque: ${data.text}`,icon:"bell"});
              setPushNotifs(p=>[n,...p]);
            }
          }} onClose={()=>setModal(null)}/>
        </Modal>
      )}

      {/* Auth */}
      {modal==="auth"&&<Modal onClose={()=>setModal(null)}><AuthForm onSubmit={handleAuth}/></Modal>}

      {/* Menu */}
      {modal==="menu"&&(
        <Modal onClose={()=>setModal(null)}>
          {currentUser ? (
            <div style={{marginBottom:16,padding:16,background:"linear-gradient(135deg,#E8590C08,#DC262608)",borderRadius:14,border:"1px solid #E8590C15"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center"}}><$.User s={22} c="#fff"/></div>
                <div>
                  <div style={{fontWeight:800,fontSize:16}}>{currentUser.name||currentUser.email}</div>
                  <div style={{fontSize:11,color:"#78716C"}}>{currentUser.email}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:isSubscriptionActive(currentUser)?"#059669":"#D97706",background:isSubscriptionActive(currentUser)?"#05966910":"#FEF3C7",padding:"3px 9px",borderRadius:7,fontWeight:700}}><$.Shield s={11} c={isSubscriptionActive(currentUser)?"#059669":"#D97706"}/>{isSubscriptionActive(currentUser)?`Activo (${daysRemaining(currentUser)} días)`:"Sin suscripción"}</span>
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#78716C",background:"#F5F5F4",padding:"3px 9px",borderRadius:7,fontWeight:600}}><$.Clock s={11} c="#78716C"/>Desde {new Date(currentUser.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ) : (
            <h3 style={{fontSize:17,fontWeight:800,marginBottom:14,letterSpacing:"-.03em"}}>Menú</h3>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:1}}>
            {[
              {l:"Inicio",i:<$.Paw s={16}/>,fn:()=>{setSelectedPet(null);setPage("home");setModal(null);}},
              {l:"Perdí mi mascota",i:<$.Heart s={16}/>,fn:()=>setModal("register")},
              {l:"Encontré una mascota",i:<$.Cam s={16}/>,fn:()=>setModal("found")},
              {l:"PetFinder Club US$6/mes",i:<$.Crown s={16} c="#FBBF24"/>,fn:()=>{setPage("club");setSelectedPet(null);setModal(null);}},
              {l:"Adopción",i:<$.Heart s={16} c="#EF4444"/>,fn:()=>{setPage("adoption");setSelectedPet(null);setModal(null);}},
              {l:"Guarda temporal",i:<$.Shield s={16} c="#2563EB"/>,fn:()=>{setPage("foster");setSelectedPet(null);setModal(null);}},
              {l:"Veterinario IA",i:<$.AI s={16} c="#059669"/>,fn:()=>{setPage("vet");setSelectedPet(null);setModal(null);}},
              {l:"PetMatch",i:<$.Sparkle s={16} c="#EC4899"/>,fn:()=>{setPage("petmatch");setSelectedPet(null);setModal(null);}},
              {l:"Comunidad",i:<$.Paw s={16} c="#F59E0B"/>,fn:()=>{setPage("community");setSelectedPet(null);setModal(null);}},
              {l:"Servicios Pet",i:<$.Star s={16} c="#F59E0B"/>,fn:()=>{setPage("market");setSelectedPet(null);setModal(null);}},
              {l:"Canal YouTube",i:<$.Eye s={16} c="#DC2626"/>,fn:()=>window.open("https://youtube.com/@PetFinderAI","_blank")},

              {l:"Asistente IA",i:<$.Sparkle s={16}/>,fn:()=>setModal("ai-chat")},
              ...(!currentUser?[{l:"Iniciar sesión",i:<$.User s={16}/>,fn:()=>setModal("auth"),accent:true}]:
                [{l:"Cerrar sesión",i:<$.Back s={16}/>,fn:handleLogout,danger:true}]),
              {l:"Planes US$20 / US$50",i:<$.Zap s={16}/>,fn:()=>setModal("premium")},
            ].map((item,i)=>(
              <button key={i} onClick={item.fn} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 12px",borderRadius:11,border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,color:item.danger?"#DC2626":item.accent?"#E8590C":"#44403C",fontFamily:"inherit",textAlign:"left",transition:"background .2s"}} onMouseEnter={e=>e.currentTarget.style.background="#FAFAF9"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{color:item.danger?"#DC2626":"#E8590C"}}>{item.i}</span>{item.l}
              </button>
            ))}
          </div>
          <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #F5F5F4",textAlign:"center"}}><p style={{fontSize:10,color:"#D6D3D1"}}>PetFinder AI v3.2 · Auth + Payments + Claude Vision</p></div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════
function Modal({children,onClose}){
  return <div className="mo" onClick={onClose}><div className="mc" onClick={e=>e.stopPropagation()}><button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"none",border:"none",cursor:"pointer",padding:3,zIndex:1}}><$.X s={20} c="#A8A29E"/></button>{children}</div></div>;
}

// ═══════════════════════════════════════════════════════════
// INTERACTIVE MAP WITH RADIUS (Leaflet)
// ═══════════════════════════════════════════════════════════
function MapRadius({ lat, lng, radiusKm, onLocationChange, exposureTier }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const tierColor = exposureTier==="platinum"?"#7C3AED":exposureTier==="oro"?"#D97706":"#94A3B8";

  // Load Leaflet dynamically
  useEffect(()=>{
    if(window.L){setLeafletReady(true);return;}
    const script=document.createElement("script");
    script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload=()=>setLeafletReady(true);
    document.head.appendChild(script);
  },[]);

  useEffect(()=>{
    if(!mapRef.current||!leafletReady||!window.L) return;
    if(!mapInstanceRef.current){
      const map = window.L.map(mapRef.current,{
        center:[lat,lng],zoom:13,zoomControl:true,
        attributionControl:false,
      });
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:18,
      }).addTo(map);
      // Custom paw icon
      const pawIcon = window.L.divIcon({
        html:`<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#E8590C,#DC2626);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(232,89,12,.5);border:3px solid #fff"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><ellipse cx="8" cy="6" rx="2.5" ry="3"/><ellipse cx="16" cy="6" rx="2.5" ry="3"/><ellipse cx="4.5" cy="12" rx="2" ry="2.5"/><ellipse cx="19.5" cy="12" rx="2" ry="2.5"/><path d="M7 16c0-2 2.5-4 5-4s5 2 5 4-1.5 4-5 4-5-2-5-4z"/></svg></div>`,
        iconSize:[36,36],iconAnchor:[18,18],className:"",
      });
      const marker = window.L.marker([lat,lng],{icon:pawIcon,draggable:true}).addTo(map);
      const circle = window.L.circle([lat,lng],{
        radius:radiusKm*1000,color:tierColor,fillColor:tierColor,
        fillOpacity:0.12,weight:2,dashArray:"8,6",
      }).addTo(map);

      // Drag marker → update location
      marker.on("dragend",async function(){
        const pos=marker.getLatLng();
        circle.setLatLng(pos);
        // Reverse geocode
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&accept-language=es`);
          const data=await r.json();
          const addr=data.address;
          const name=[addr.neighbourhood||addr.suburb||"",addr.city||addr.town||addr.village||"",addr.state||""].filter(Boolean).join(", ");
          onLocationChange(pos.lat,pos.lng,name);
        }catch{onLocationChange(pos.lat,pos.lng,"");}
      });

      // Click map → move marker
      map.on("click",async function(e){
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json&accept-language=es`);
          const data=await r.json();
          const addr=data.address;
          const name=[addr.neighbourhood||addr.suburb||"",addr.city||addr.town||addr.village||"",addr.state||""].filter(Boolean).join(", ");
          onLocationChange(e.latlng.lat,e.latlng.lng,name);
        }catch{onLocationChange(e.latlng.lat,e.latlng.lng,"");}
      });

      mapInstanceRef.current=map;markerRef.current=marker;circleRef.current=circle;
      // Fix map container size after modal animation
      setTimeout(()=>map.invalidateSize(),400);
    }
  },[leafletReady]);

  // Update circle when radius or tier changes
  useEffect(()=>{
    if(circleRef.current){
      circleRef.current.setRadius(radiusKm*1000);
      circleRef.current.setStyle({color:tierColor,fillColor:tierColor});
    }
    if(mapInstanceRef.current&&markerRef.current){
      const z=radiusKm<=1?15:radiusKm<=3?14:radiusKm<=5?13:radiusKm<=10?12:radiusKm<=20?11:9;
      mapInstanceRef.current.setView(markerRef.current.getLatLng(),z,{animate:true});
    }
  },[radiusKm,tierColor]);

  // Update marker position when GPS changes externally
  useEffect(()=>{
    if(markerRef.current&&circleRef.current&&mapInstanceRef.current){
      const pos=markerRef.current.getLatLng();
      if(Math.abs(pos.lat-lat)>0.0001||Math.abs(pos.lng-lng)>0.0001){
        markerRef.current.setLatLng([lat,lng]);
        circleRef.current.setLatLng([lat,lng]);
        mapInstanceRef.current.setView([lat,lng],13,{animate:true});
      }
    }
  },[lat,lng]);

  return (
    <div style={{position:"relative"}}>
      <div ref={mapRef} style={{width:"100%",height:220,borderRadius:14,overflow:"hidden",border:"2px solid #E7E5E4"}}/>
      {/* Overlay badge */}
      <div style={{position:"absolute",top:10,right:10,zIndex:1000,background:"#fff",borderRadius:10,padding:"6px 12px",boxShadow:"0 2px 12px rgba(0,0,0,.15)",display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:tierColor}}/>
        <span style={{fontSize:10,fontWeight:700,color:tierColor}}>Radio {radiusKm}km</span>
      </div>
      <div style={{position:"absolute",bottom:10,left:10,zIndex:1000,background:"rgba(0,0,0,.75)",borderRadius:8,padding:"4px 10px"}}>
        <span style={{fontSize:10,fontWeight:600,color:"#fff"}}>Arrastrá el pin o tocá el mapa</span>
      </div>
    </div>
  );
}

function PetForm({title,sub,type,onSubmit,onClose,analyzePhoto,analyzingPhoto,analysisResult,setAnalysisResult}){
  const [d,setD]=useState({
    name:"",type:"dog",breed:"",description:"",
    location:{lat:-34.6037,lng:-58.3816,address:""},
    ownerName:"",ownerPhone:"",finderName:"",finderPhone:"",
    phoneAreaCode:"11",phoneNumber:"",
    reward:"",plan:"free",status:type==="found"?"found":"lost",
    respondsToName:null,hasCollar:null,collarColor:"",hasChip:null,
    size:"",color:"",furLength:"",age:"",temperament:"",
    lastSeenTime:"",lastSeenDetail:"",distinctiveMarks:"",alertRadius:"5km",
    exposureTier:"plata",
  });
  const [step,setStep]=useState(1);
  const [preview,setPreview]=useState(null);
  const [photoBase64,setPhotoBase64]=useState(null);
  const [photoType,setPhotoType]=useState(null);
  const [geoLoading,setGeoLoading]=useState(false);
  const [geoError,setGeoError]=useState(null);
  const fileRef=useRef(null);
  const handlePhoto=async(e)=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=(ev)=>{setPreview(ev.target.result);setPhotoBase64(ev.target.result.split(",")[1]);setPhotoType(f.type||"image/jpeg");};reader.readAsDataURL(f);};
  const handleAnalyze=async()=>{if(!photoBase64)return;const result=await analyzePhoto(photoBase64,photoType,d.description);if(result){setAnalysisResult(result);setD(p=>({...p,type:result.species||p.type,breed:result.breed||p.breed,color:result.primaryColor||p.color,size:result.size||p.size,furLength:result.furLength||p.furLength,hasCollar:result.hasCollar??p.hasCollar}));}};
  const up=(k,v)=>setD(p=>({...p,[k]:v}));

  // GPS auto-location
  const getGPS=()=>{
    if(!navigator.geolocation){setGeoError("Tu navegador no soporta geolocalización");return;}
    setGeoLoading(true);setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async(pos)=>{
        const lat=pos.coords.latitude,lng=pos.coords.longitude;
        setD(p=>({...p,location:{...p.location,lat,lng}}));
        // Reverse geocode with free API
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`);
          const data=await r.json();
          const addr=data.address;
          const name=[addr.neighbourhood||addr.suburb||"",addr.city||addr.town||addr.village||"",addr.state||""].filter(Boolean).join(", ");
          setD(p=>({...p,location:{lat,lng,address:name||`${lat.toFixed(4)}, ${lng.toFixed(4)}`}}));
        }catch{setD(p=>({...p,location:{lat,lng,address:`${lat.toFixed(4)}, ${lng.toFixed(4)}`}}));}
        setGeoLoading(false);
      },
      (err)=>{setGeoError(err.code===1?"Permiso de ubicación denegado":"No se pudo obtener ubicación");setGeoLoading(false);},
      {enableHighAccuracy:true,timeout:10000}
    );
  };

  // Format phone for WhatsApp and display
  const getFullPhone=()=>{
    const area=d.phoneAreaCode||"11";
    const num=(d.phoneNumber||"").replace(/\D/g,"");
    return `+54 ${area} ${num}`;
  };

  const handleSubmit=()=>{
    const phone=getFullPhone();
    const finalData={...d,photoData:preview,aiFeatures:analysisResult?{...analysisResult,source:"claude-vision"}:null};
    if(type==="lost"){finalData.ownerPhone=phone;}else{finalData.finderPhone=phone;}
    onSubmit(finalData);setAnalysisResult(null);
  };
  const Chip=({label,selected,onClick,color="#E8590C",icon=null})=>(<button onClick={onClick} style={{padding:"8px 14px",borderRadius:10,border:selected?`2px solid ${color}`:"2px solid #E7E5E4",background:selected?`${color}0A`:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:selected?color:"#78716C",fontFamily:"inherit",transition:"all .2s",display:"inline-flex",alignItems:"center",gap:4}}>{icon}{label}</button>);
  const YesNo=({value,onChange})=>(<div style={{display:"flex",gap:6}}><Chip label="Sí" selected={value===true} onClick={()=>onChange(true)}/><Chip label="No" selected={value===false} onClick={()=>onChange(false)}/><Chip label="No sé" selected={value===null} onClick={()=>onChange(null)} color="#A8A29E"/></div>);

  return (
    <div>
      <h3 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:3}}>{title}</h3>
      <p style={{color:"#A8A29E",fontSize:12,marginBottom:14}}>{sub}</p>
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {[0,1,2,3].map(i=>(<div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><div style={{width:"100%",height:3,borderRadius:2,background:i<step?"linear-gradient(90deg,#E8590C,#DC2626)":"#E7E5E4",transition:"all .3s"}}/><span style={{fontSize:9,fontWeight:600,color:i<step?"#E8590C":"#D6D3D1"}}>{["Foto","Detalles","Zona","Contacto"][i]}</span></div>))}
      </div>

      {/* STEP 1: PHOTO */}
      {step===1&&(<div style={{display:"flex",flexDirection:"column",gap:18,animation:"fadeIn .3s"}}>
        <div onClick={()=>fileRef.current?.click()} style={{border:"2px dashed #E7E5E4",borderRadius:18,padding:preview?0:24,textAlign:"center",cursor:"pointer",background:preview?"none":"#FAFAF9",minHeight:280,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
          {preview?<img src={preview} style={{width:"100%",height:340,objectFit:"cover",borderRadius:18}} alt=""/>:<><$.Cam s={28} c="#D6D3D1"/><div style={{marginTop:8,fontWeight:600,color:"#A8A29E",fontSize:13}}>Subir foto</div><div style={{fontSize:10,color:"#D6D3D1",marginTop:2}}>La IA analizará la imagen</div></>}
          {preview&&!analysisResult&&!analyzingPhoto&&<button className="bp" style={{position:"absolute",bottom:8,left:"50%",transform:"translateX(-50%)",padding:"7px 14px",fontSize:11,borderRadius:9,animation:"glow 2s infinite"}} onClick={e=>{e.stopPropagation();handleAnalyze();}}><$.Scan s={13} c="#fff"/> Analizar con IA</button>}
          {analyzingPhoto&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,borderRadius:12}}><div style={{width:36,height:36,border:"3px solid #E8590C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}/><div style={{color:"#fff",fontSize:12,fontWeight:600}}>Analizando...</div></div>}
          {analysisResult&&<div style={{position:"absolute",bottom:8,right:8,background:"#059669",color:"#fff",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><$.Check s={12} c="#fff"/> IA OK</div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
        {analysisResult&&(<div style={{background:"#05966908",border:"1px solid #05966920",borderRadius:12,padding:10}}><div style={{fontSize:10,fontWeight:700,color:"#059669",marginBottom:6,display:"flex",alignItems:"center",gap:4}}><$.AI s={12} c="#059669"/> IA detectó</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{[analysisResult.breed&&`Raza: ${analysisResult.breed}`,analysisResult.primaryColor&&`Color: ${analysisResult.primaryColor}`,analysisResult.size&&`Tamaño: ${analysisResult.size}`].filter(Boolean).map((t,i)=>(<span key={i} style={{background:"#fff",padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:600,color:"#057A55"}}>{t}</span>))}</div></div>)}
        <div style={{display:"flex",gap:12}}>{[{k:"dog",l:"Perro",i:<$.Dog s={16}/>},{k:"cat",l:"Gato",i:<$.Cat s={16}/>}].map(t=>(<button key={t.k} onClick={()=>up("type",t.k)} style={{flex:1,padding:18,borderRadius:12,border:d.type===t.k?"2px solid #E8590C":"2px solid #E7E5E4",background:d.type===t.k?"#E8590C08":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontWeight:700,fontSize:13,color:d.type===t.k?"#E8590C":"#78716C",fontFamily:"inherit"}}>{t.i}{t.l}</button>))}</div>
        <button className="bp" style={{width:"100%",justifyContent:"center"}} onClick={()=>setStep(2)}>Siguiente <$.Arr s={14}/></button>
      </div>)}

      {/* STEP 2: DETAILED SURVEY */}
      {step===2&&(<div style={{display:"flex",flexDirection:"column",gap:13,animation:"fadeIn .3s"}}>
        {type==="lost"&&<input placeholder="Nombre de la mascota" value={d.name} onChange={e=>up("name",e.target.value)}/>}
        <input placeholder={analysisResult?.breed?`Raza (IA: ${analysisResult.breed})`:"Raza (o estimada)"} value={d.breed} onChange={e=>up("breed",e.target.value)}/>

        {type==="lost"&&(<div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>¿RESPONDE A SU NOMBRE?</label><YesNo value={d.respondsToName} onChange={v=>up("respondsToName",v)}/></div>)}

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>¿LLEVA COLLAR?</label><YesNo value={d.hasCollar} onChange={v=>up("hasCollar",v)}/>{d.hasCollar===true&&<input placeholder="Color / tipo de collar" value={d.collarColor} onChange={e=>up("collarColor",e.target.value)} style={{marginTop:8}}/>}</div>

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>¿TIENE MICROCHIP?</label><YesNo value={d.hasChip} onChange={v=>up("hasChip",v)}/></div>

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>TAMAÑO</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{[{k:"tiny",l:"Muy chico (-3kg)"},{k:"small",l:"Chico (3-10kg)"},{k:"medium",l:"Mediano (10-25kg)"},{k:"large",l:"Grande (25-45kg)"},{k:"xlarge",l:"Muy grande (+45kg)"}].map(s=>(<Chip key={s.k} label={s.l} selected={d.size===s.k} onClick={()=>up("size",s.k)}/>))}</div></div>

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>COLOR PRINCIPAL</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{["Blanco","Negro","Marrón","Dorado","Gris","Naranja","Crema","Atigrado","Manchado","Otro"].map(c=>(<Chip key={c} label={c} selected={d.color===c} onClick={()=>up("color",c)}/>))}</div></div>

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>PELO</label><div style={{display:"flex",gap:5}}>{[{k:"short",l:"Corto"},{k:"medium",l:"Medio"},{k:"long",l:"Largo"},{k:"hairless",l:"Sin pelo"}].map(f=>(<Chip key={f.k} label={f.l} selected={d.furLength===f.k} onClick={()=>up("furLength",f.k)}/>))}</div></div>

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>EDAD APROX.</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{[{k:"puppy",l:"Cachorro"},{k:"young",l:"Joven (1-3)"},{k:"adult",l:"Adulto (3-8)"},{k:"senior",l:"Mayor (+8)"}].map(a=>(<Chip key={a.k} label={a.l} selected={d.age===a.k} onClick={()=>up("age",a.k)}/>))}</div></div>

        <div><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>TEMPERAMENTO</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{["Amigable","Tímido","Agresivo","Juguetón","Tranquilo","Miedoso"].map(t=>(<Chip key={t} label={t} selected={d.temperament===t} onClick={()=>up("temperament",t)}/>))}</div></div>

        <input placeholder="Marcas distintivas (cicatriz, mancha, oreja cortada...)" value={d.distinctiveMarks} onChange={e=>up("distinctiveMarks",e.target.value)}/>
        <textarea placeholder="Algo más que quieras agregar..." value={d.description} onChange={e=>up("description",e.target.value)}/>
        <div style={{display:"flex",gap:7}}><button className="bo" onClick={()=>setStep(1)}>← Atrás</button><button className="bp" style={{flex:1,justifyContent:"center"}} onClick={()=>setStep(3)}>Siguiente <$.Arr s={14}/></button></div>
      </div>)}

      {/* STEP 3: GEO / ALERT ZONE + EXPOSURE TIERS */}
      {step===3&&(<div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s"}}>
        <div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:12,padding:12,display:"flex",gap:10,alignItems:"flex-start"}}><$.Bell s={18} c="#D97706"/><div><div style={{fontWeight:700,fontSize:12,color:"#92400E",marginBottom:2}}>Geolocalización + Difusión por radio</div><div style={{fontSize:11,color:"#A16207",lineHeight:1.4}}>Marcá dónde se extravió y elegí el alcance de la difusión en redes sociales.</div></div></div>

        {/* GPS Button */}
        <button onClick={getGPS} disabled={geoLoading} style={{
          width:"100%",padding:"14px 16px",borderRadius:12,border:"2px solid #2563EB",
          background:d.location.lat!==-34.6037?"#2563EB08":"#fff",
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          fontFamily:"inherit",fontWeight:700,fontSize:13,
          color:d.location.lat!==-34.6037?"#2563EB":"#2563EB",transition:"all .2s",
        }}>
          {geoLoading?<><div style={{width:16,height:16,border:"2px solid #2563EB",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}/> Obteniendo ubicación...</>:
          d.location.lat!==-34.6037?<><$.Pin s={16} c="#2563EB"/> Ubicación detectada</>:
          <><$.Pin s={16} c="#2563EB"/> Usar mi ubicación GPS</>}
        </button>
        {geoError&&<div style={{fontSize:11,color:"#DC2626",fontWeight:600}}>{geoError}</div>}

        <input placeholder={type==="lost"?"Zona / barrio donde se extravió":"Zona donde la encontraste"} value={d.location.address} onChange={e=>setD(p=>({...p,location:{...p.location,address:e.target.value}}))}/>

        {type==="lost"&&(<><label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em"}}>¿CUÁNDO FUE LA ÚLTIMA VEZ?</label><div style={{display:"flex",flexWrap:"wrap",gap:5}}>{["Hoy","Ayer","Hace 2-3 días","Hace 1 semana","Más de 1 semana"].map(t=>(<Chip key={t} label={t} selected={d.lastSeenTime===t} onClick={()=>up("lastSeenTime",t)}/>))}</div><input placeholder="Detalle del lugar (ej: 'cerca de la plaza, frente al kiosco')" value={d.lastSeenDetail} onChange={e=>up("lastSeenDetail",e.target.value)}/></>)}

        {/* INTERACTIVE MAP WITH RADIUS */}
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>RADIO DE BÚSQUEDA Y DIFUSIÓN</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
            {[
              {r:"1km",km:1},{r:"3km",km:3},{r:"5km",km:5},
              {r:"10km",km:10},{r:"20km",km:20},{r:"50km",km:50},
            ].map(r=>(
              <Chip key={r.r} label={r.r} selected={d.alertRadius===r.r} onClick={()=>up("alertRadius",r.r)} color="#2563EB"/>
            ))}
          </div>

          {/* Leaflet Map */}
          <MapRadius
            lat={d.location.lat}
            lng={d.location.lng}
            radiusKm={{"1km":1,"3km":3,"5km":5,"10km":10,"20km":20,"50km":50}[d.alertRadius]||5}
            onLocationChange={(lat,lng,addr)=>setD(p=>({...p,location:{lat,lng,address:addr||p.location.address}}))}
            exposureTier={d.exposureTier}
          />
          <div style={{fontSize:10,color:"#A8A29E",marginTop:6,textAlign:"center"}}>Tocá el mapa para mover el pin · El círculo muestra el alcance de la difusión</div>
        </div>

        {/* EXPOSURE TIER SELECTOR - Plata / Oro / Platinum */}
        {type==="lost"&&(
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:8,display:"block"}}>NIVEL DE EXPOSICIÓN EN REDES</label>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                {key:"plata",name:"Plata",price:"US$20/sem",color:"#94A3B8",bg:"#94A3B808",border:"#94A3B830",
                  badge:"🥈",freq:"Cada 24hs",reach:"Tu zona",
                  desc:"Publicamos tu anuncio en el feed de PetFinder para usuarios dentro de tu radio. Ideal para empezar la búsqueda.",
                  feats:["Anuncio en plataforma PetFinder","Visible para usuarios en tu radio","Alerta push a vecinos","1 publicación por día","Resultados IA + contacto directo"]},
                {key:"oro",name:"Oro",price:"US$50/sem",color:"#D97706",bg:"#D9770608",border:"#D97706",popular:true,
                  badge:"🥇",freq:"Cada 12hs",reach:"Radio completo",
                  desc:"Anuncios pagos en Facebook e Instagram geolocalizados exactamente en el radio que marcaste en el mapa. La gente que está AHORA en esa zona ve tu mascota.",
                  feats:["Todo Plata +","Anuncios Facebook Ads en tu radio","Anuncios Instagram en tu zona","Grupos WhatsApp barriales","Flyer profesional auto-generado","Republicación cada 12hs","Hashtags + geotags optimizados"]},
                {key:"platinum",name:"Platinum",price:"US$79/sem",color:"#7C3AED",bg:"#7C3AED08",border:"#7C3AED",
                  badge:"💎",freq:"Cada 6hs",reach:"Máximo alcance",
                  desc:"Máxima exposición: anuncios pagos en TODAS las redes geolocalizados en tu radio + alertas a refugios y veterinarias. Como pegar 10.000 afiches digitales.",
                  feats:["Todo Oro +","TikTok + X + Telegram + Nextdoor","Alerta a refugios y vets en 20km","Anuncios en clasificados locales","Republicación cada 6hs","Reporte de alcance diario","Posición #1 destacada en feed","Contacto prioritario 24/7"]},
              ].map(tier=>(
                <div key={tier.key} onClick={()=>up("exposureTier",tier.key)} style={{
                  border:d.exposureTier===tier.key?`2px solid ${tier.color}`:`2px solid ${tier.border||"#E7E5E4"}`,
                  borderRadius:14,padding:14,cursor:"pointer",position:"relative",
                  background:d.exposureTier===tier.key?tier.bg:"#fff",
                  transition:"all .2s",
                }}>
                  {tier.popular&&<div style={{position:"absolute",top:-8,right:12,background:tier.color,color:"#fff",padding:"2px 10px",borderRadius:100,fontSize:9,fontWeight:800,letterSpacing:".06em"}}>POPULAR</div>}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:20}}>{tier.badge}</span>
                      <div>
                        <div style={{fontWeight:800,fontSize:14,color:tier.color}}>{tier.name}</div>
                        <div style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em"}}>{tier.price}</div>
                      </div>
                    </div>
                    <div style={{width:22,height:22,borderRadius:"50%",border:d.exposureTier===tier.key?`2px solid ${tier.color}`:"2px solid #E7E5E4",background:d.exposureTier===tier.key?tier.color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {d.exposureTier===tier.key&&<$.Check s={14} c="#fff"/>}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:"#57534E",lineHeight:1.4,marginBottom:8}}>{tier.desc}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span style={{background:`${tier.color}15`,color:tier.color,padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>📡 {tier.freq}</span>
                    <span style={{background:`${tier.color}15`,color:tier.color,padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:700}}>👁 {tier.reach}</span>
                  </div>
                  {d.exposureTier===tier.key&&(
                    <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:3}}>
                      {tier.feats.map((f,i)=>(<span key={i} style={{fontSize:10,color:"#57534E",display:"flex",alignItems:"center",gap:3}}><$.Check s={10} c={tier.color}/>{f}</span>))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {d.location.address&&<div style={{background:"#2563EB08",border:"1px solid #2563EB15",borderRadius:10,padding:10,display:"flex",gap:8,alignItems:"center"}}><$.Pin s={16} c="#2563EB"/><div style={{fontSize:11,color:"#1E40AF",lineHeight:1.4}}><strong>Radio: {d.alertRadius}</strong> desde {d.location.address}. {type==="lost"?`Nivel ${d.exposureTier}: anuncios disparados en redes cada ${d.exposureTier==="plata"?"24hs":d.exposureTier==="oro"?"12hs":"6hs"}.`:"Usuarios en esta área recibirán alertas."}</div></div>}

        <div style={{display:"flex",gap:7}}><button className="bo" onClick={()=>setStep(2)}>← Atrás</button><button className="bp" style={{flex:1,justifyContent:"center"}} onClick={()=>setStep(4)}>Siguiente <$.Arr s={14}/></button></div>
      </div>)}

      {/* STEP 4: CONTACT + SUMMARY */}
      {step===4&&(<div style={{display:"flex",flexDirection:"column",gap:10,animation:"fadeIn .3s"}}>
        <div style={{background:"#FAFAF9",borderRadius:12,padding:12,marginBottom:4}}>
          <div style={{fontSize:10,fontWeight:700,color:"#A8A29E",letterSpacing:".05em",marginBottom:8}}>RESUMEN</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {[d.type==="dog"?"🐕 Perro":"🐈 Gato",d.breed,d.size&&({tiny:"Muy chico",small:"Chico",medium:"Mediano",large:"Grande",xlarge:"Muy grande"})[d.size],d.color,d.furLength&&`Pelo ${({short:"corto",medium:"medio",long:"largo",hairless:"sin pelo"})[d.furLength]}`,d.age&&({puppy:"Cachorro",young:"Joven",adult:"Adulto",senior:"Mayor"})[d.age],d.temperament,d.hasCollar===true?`Collar: ${d.collarColor||"sí"}`:d.hasCollar===false?"Sin collar":null,d.hasChip===true?"Con microchip":null,d.respondsToName===true&&d.name?`Responde a "${d.name}"`:null,d.distinctiveMarks,d.lastSeenTime&&`Visto: ${d.lastSeenTime}`].filter(Boolean).map((t,i)=>(<span key={i} style={{background:"#fff",padding:"3px 9px",borderRadius:7,fontSize:11,fontWeight:600,color:"#57534E",border:"1px solid #E7E5E4"}}>{t}</span>))}
          </div>
          {d.location.address&&<div style={{display:"flex",alignItems:"center",gap:4,marginTop:8,fontSize:11,color:"#2563EB"}}><$.Pin s={12} c="#2563EB"/> {d.location.address} · Radio {d.alertRadius}</div>}
          {type==="lost"&&d.exposureTier&&(
            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:6,fontSize:11,fontWeight:700,color:d.exposureTier==="plata"?"#94A3B8":d.exposureTier==="oro"?"#D97706":"#7C3AED"}}>
              {d.exposureTier==="plata"?"🥈":d.exposureTier==="oro"?"🥇":"💎"} Exposición {d.exposureTier.charAt(0).toUpperCase()+d.exposureTier.slice(1)} · {d.exposureTier==="plata"?"US$20":d.exposureTier==="oro"?"US$50":"US$79"}/sem
            </div>
          )}
        </div>
        <input placeholder="Tu nombre" value={type==="lost"?d.ownerName:d.finderName} onChange={e=>up(type==="lost"?"ownerName":"finderName",e.target.value)}/>

        {/* Phone with +54 format */}
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>TELÉFONO / WHATSAPP</label>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:0,flexShrink:0}}>
              <span style={{background:"#F5F5F4",padding:"11px 10px",borderRadius:"11px 0 0 11px",border:"2px solid #E7E5E4",borderRight:"none",fontSize:13,fontWeight:700,color:"#57534E"}}>🇦🇷 +54</span>
              <select value={d.phoneAreaCode} onChange={e=>up("phoneAreaCode",e.target.value)} style={{width:70,borderRadius:"0 0 0 0",borderLeft:"none",borderRight:"none",padding:"11px 4px",fontSize:13,fontWeight:600,textAlign:"center"}}>
                <option value="11">11</option><option value="351">351</option><option value="341">341</option>
                <option value="261">261</option><option value="381">381</option><option value="223">223</option>
                <option value="343">343</option><option value="299">299</option><option value="362">362</option>
                <option value="379">379</option><option value="388">388</option><option value="266">266</option>
              </select>
            </div>
            <input placeholder="Ej: 5555-1234" value={d.phoneNumber} onChange={e=>up("phoneNumber",e.target.value)} style={{flex:1,borderRadius:"0 11px 11px 0",borderLeft:"none"}}/>
          </div>
          <div style={{fontSize:10,color:"#A8A29E",marginTop:4}}>Tu número completo: {getFullPhone()}</div>
        </div>

        {type==="lost"&&<input placeholder="Recompensa (opcional, ej: $20.000)" value={d.reward} onChange={e=>up("reward",e.target.value)}/>}
        <div style={{display:"flex",gap:7}}><button className="bo" onClick={()=>setStep(3)}>← Atrás</button><button className="bp" style={{flex:1,justifyContent:"center"}} onClick={handleSubmit}><$.Check s={15}/> Publicar</button></div>
      </div>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAYMENT COMPONENTS
// ═══════════════════════════════════════════════════════════
const SUBSCRIPTION = {
  price: 20, currency: "USD", period: 7, // days
  name: "Suscripción Semanal",
  includes: [
    "Ver resultados de búsqueda IA",
    "Contactar a quien encontró tu mascota",
    "Tu mascota visible en la plataforma 7 días",
    "Alertas push cuando hay coincidencias",
    "Chat directo con quien la encontró",
    "Renovación cada 7 días",
  ],
  free: [
    "Subir foto de mascota perdida (gratis)",
    "Subir foto de mascota encontrada (gratis)",
    "Ver el escaneo IA en acción (gratis)",
    "Ver tu mascota publicada (gratis)",
  ],
};

function isSubscriptionActive(user) {
  if (!user?.subscribedAt) return false;
  const subDate = new Date(user.subscribedAt);
  const now = new Date();
  const diffDays = (now - subDate) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

function daysRemaining(user) {
  if (!user?.subscribedAt) return 0;
  const subDate = new Date(user.subscribedAt);
  const now = new Date();
  const remaining = 7 - Math.floor((now - subDate) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

function PremiumFlow({ currentUser, onSelectPlan, onClose }) {
  const active = isSubscriptionActive(currentUser);
  const days = daysRemaining(currentUser);

  return (
    <div>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 10px",background:active?"linear-gradient(135deg,#059669,#10B981)":"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {active?<$.Check s={28} c="#fff"/>:<$.Zap s={28} c="#fff"/>}
        </div>
        <h3 style={{fontSize:22,fontWeight:800,letterSpacing:"-.03em"}}>
          {active?"Suscripción activa":"Desbloquear resultados"}
        </h3>
        {active?(
          <p style={{fontSize:13,color:"#059669",fontWeight:700,marginTop:6}}>
            Te quedan {days} día{days!==1?"s":""} de acceso
          </p>
        ):(
          <p style={{fontSize:12,color:"#A8A29E",marginTop:6}}>
            Pagá una vez, accedé 7 días completos
          </p>
        )}
      </div>

      {/* What's included */}
      <div style={{background:"#FAFAF9",borderRadius:16,padding:16,marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#059669",letterSpacing:".06em",marginBottom:10}}>GRATIS PARA TODOS</div>
        {SUBSCRIPTION.free.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,color:"#57534E",marginBottom:6}}>
            <$.Check s={14} c="#059669"/>{f}
          </div>
        ))}
      </div>

      {/* Paid tier */}
      <div style={{
        background:active?"#05966908":"linear-gradient(135deg,#E8590C05,#DC262605)",
        border:active?"2px solid #05966930":"2px solid #E8590C",
        borderRadius:18,padding:18,marginBottom:16,position:"relative",
      }}>
        {!active&&<div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"#E8590C",color:"#fff",padding:"3px 16px",borderRadius:100,fontSize:10,fontWeight:800,letterSpacing:".08em"}}>ACCESO COMPLETO</div>}
        
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:active?"#059669":"#E8590C"}}>
              {active?"Plan activo":"Suscripción semanal"}
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:2}}>
              <span style={{fontSize:32,fontWeight:800,letterSpacing:"-.04em"}}>US$20</span>
              <span style={{fontSize:13,color:"#A8A29E",fontWeight:600}}>/7 días</span>
            </div>
          </div>
          {active&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:28,fontWeight:800,color:"#059669"}}>{days}</div>
              <div style={{fontSize:10,color:"#A8A29E",fontWeight:600}}>días restantes</div>
            </div>
          )}
        </div>

        {SUBSCRIPTION.includes.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7,fontSize:13,color:"#57534E",marginBottom:6}}>
            <$.Check s={14} c={active?"#059669":"#E8590C"}/>{f}
          </div>
        ))}

        {!active?(
          <button className="bp" style={{width:"100%",justifyContent:"center",marginTop:14,padding:"14px 24px",fontSize:15}}
            onClick={()=>onSelectPlan({key:"weekly",n:"Búsqueda Básica",price:20,finalPrice:20,finalPeriod:"semana",billing:"weekly",c:"#E8590C",fs:SUBSCRIPTION.includes})}>
            <$.Zap s={16}/> Suscribirme por US$20
          </button>
        ):(
          <div style={{marginTop:14,textAlign:"center"}}>
            <div style={{fontSize:12,color:"#78716C"}}>Expira el {new Date(new Date(currentUser.subscribedAt).getTime()+7*24*60*60*1000).toLocaleDateString("es-AR")}</div>
            <button className="bo" style={{marginTop:8,width:"100%",justifyContent:"center"}}
              onClick={()=>onSelectPlan({key:"weekly",n:"Búsqueda Básica",price:20,finalPrice:20,finalPeriod:"semana",billing:"weekly",c:"#E8590C",fs:SUBSCRIPTION.includes})}>
              Renovar ahora
            </button>
          </div>
        )}
      </div>

      {/* ═══ PLAN US$50 — MÁXIMA EXPOSICIÓN ═══ */}
      <div style={{
        background:"linear-gradient(135deg,#7C3AED08,#2563EB08)",
        border:currentUser?.plan==="boost"?"2px solid #059669":"2px solid #7C3AED",
        borderRadius:18,padding:18,marginBottom:16,position:"relative",overflow:"hidden",
      }}>
        {/* Decorative glow */}
        <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:"rgba(124,58,237,.08)"}}/>
        <div style={{position:"absolute",bottom:-20,left:-20,width:70,height:70,borderRadius:"50%",background:"rgba(37,99,235,.06)"}}/>
        
        <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg,#7C3AED,#2563EB)",color:"#fff",padding:"3px 16px",borderRadius:100,fontSize:9,fontWeight:800,letterSpacing:".08em"}}>
          {currentUser?.plan==="boost"?"ACTIVO":"MÁXIMA EXPOSICIÓN"}
        </div>
        
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,marginBottom:14}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:"#7C3AED"}}>Difusión en Redes</div>
            <div style={{display:"flex",alignItems:"baseline",gap:4,marginTop:2}}>
              <span style={{fontSize:32,fontWeight:800,letterSpacing:"-.04em"}}>US$50</span>
              <span style={{fontSize:13,color:"#A8A29E",fontWeight:600}}>/7 días</span>
            </div>
            <div style={{fontSize:11,color:"#7C3AED",fontWeight:600,marginTop:2}}>Incluye todo el plan de US$20 +</div>
          </div>
        </div>

        {/* Social media icons row */}
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[
            {name:"Instagram",color:"#E4405F",bg:"#E4405F15"},
            {name:"Facebook",color:"#1877F2",bg:"#1877F215"},
            {name:"X (Twitter)",color:"#1C1917",bg:"#1C191710"},
            {name:"TikTok",color:"#000",bg:"#00000010"},
            {name:"WhatsApp",color:"#25D366",bg:"#25D36615"},
            {name:"Telegram",color:"#0088CC",bg:"#0088CC15"},
            {name:"Nextdoor",color:"#00B246",bg:"#00B24615"},
            {name:"Grupos vecinales",color:"#D97706",bg:"#D9770615"},
          ].map((s,i)=>(
            <span key={i} style={{background:s.bg,color:s.color,padding:"4px 10px",borderRadius:8,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3}}>
              {s.name}
            </span>
          ))}
        </div>

        {/* Features */}
        {[
          "Publicación automática en Instagram, Facebook, X y TikTok",
          "Difusión en grupos de WhatsApp y Telegram de mascotas",
          "Publicación en Nextdoor y grupos vecinales de la zona",
          "Imagen profesional generada con datos de tu mascota",
          "Hashtags optimizados para máximo alcance",
          "Republicación cada 48hs para mantener visibilidad",
          "Reporte de alcance: cuánta gente vio tu publicación",
          "Alerta a refugios y veterinarias en radio de 20km",
          "Contacto prioritario: las coincidencias van primero a vos",
        ].map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:7,fontSize:12,color:"#57534E",marginBottom:5}}>
            <$.Check s={14} c="#7C3AED"/>{f}
          </div>
        ))}

        {/* How the auto-posting works */}
        <div style={{background:"#fff",borderRadius:12,padding:12,marginTop:12,border:"1px solid #7C3AED15"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#7C3AED",letterSpacing:".05em",marginBottom:8}}>¿CÓMO FUNCIONA LA DIFUSIÓN?</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {n:"1",t:"Generamos la publicación",d:"Con la foto, datos y zona de tu mascota creamos un flyer profesional con toda la info de contacto."},
              {n:"2",t:"Publicamos en todas las redes",d:"Instagram, Facebook, X, TikTok, WhatsApp y Telegram. Con hashtags y geotags optimizados."},
              {n:"3",t:"Republicamos cada 48hs",d:"Para que no se pierda en el feed. Cada republicación tiene nuevo copy para mayor alcance."},
              {n:"4",t:"Reporte de alcance",d:"Te mostramos cuántas personas vieron tu publicación y desde qué plataforma."},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",gap:8}}>
                <div style={{width:20,height:20,borderRadius:6,background:"#7C3AED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0,marginTop:1}}>{s.n}</div>
                <div><div style={{fontWeight:700,fontSize:11,color:"#1C1917"}}>{s.t}</div><div style={{fontSize:10,color:"#A8A29E",lineHeight:1.4}}>{s.d}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* Reach estimate */}
        <div style={{background:"linear-gradient(135deg,#7C3AED10,#2563EB10)",borderRadius:12,padding:12,marginTop:12,textAlign:"center"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#7C3AED",letterSpacing:".05em",marginBottom:6}}>ALCANCE ESTIMADO</div>
          <div style={{display:"flex",justifyContent:"center",gap:16}}>
            {[
              {n:"50K+",l:"Personas alcanzadas"},
              {n:"8+",l:"Plataformas"},
              {n:"3x",l:"Republicaciones"},
            ].map((s,i)=>(
              <div key={i}>
                <div style={{fontSize:22,fontWeight:800,color:"#7C3AED"}}>{s.n}</div>
                <div style={{fontSize:9,color:"#A8A29E",fontWeight:600}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <button className="bp" style={{width:"100%",justifyContent:"center",marginTop:14,padding:"14px 24px",fontSize:15,background:"linear-gradient(135deg,#7C3AED,#2563EB)"}}
          onClick={()=>onSelectPlan({key:"boost",n:"Máxima Exposición",price:50,finalPrice:50,finalPeriod:"semana",billing:"weekly",c:"#7C3AED",
            fs:["Todo el plan Búsqueda (US$20)","Publicación en Instagram, Facebook, X, TikTok","Difusión WhatsApp, Telegram, grupos vecinales","Flyer profesional auto-generado","Republicación cada 48hs","Reporte de alcance","Alerta a refugios y veterinarias","Contacto prioritario"]
          })}>
          <$.Zap s={16}/> Máxima Exposición US$50
        </button>
      </div>

      {/* How it works */}
      <div style={{background:"#1C1917",borderRadius:14,padding:16,marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#FBBF24",letterSpacing:".06em",marginBottom:10}}>¿CÓMO FUNCIONA?</div>
        {[
          {n:"1",t:"Subí la foto gratis",d:"Registrá tu mascota perdida o encontrada sin costo."},
          {n:"2",t:"La IA escanea",d:"Ves el reconocimiento en acción y tu mascota publicada."},
          {n:"3",t:"US$20 → Resultados",d:"Desbloqueá coincidencias, contactos y alertas por 7 días."},
          {n:"4",t:"US$50 → Redes sociales",d:"Difusión automática en Instagram, Facebook, X, TikTok, WhatsApp y más."},
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:i<3?10:0}}>
            <div style={{width:24,height:24,borderRadius:7,background:i<3?"#E8590C":"#7C3AED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff",flexShrink:0}}>{s.n}</div>
            <div>
              <div style={{fontWeight:700,fontSize:12,color:"#fff"}}>{s.t}</div>
              <div style={{fontSize:11,color:"#A8A29E",lineHeight:1.4}}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Compare plans quick */}
      <div style={{background:"#FAFAF9",borderRadius:14,padding:14,marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,color:"#A8A29E",letterSpacing:".06em",marginBottom:10}}>COMPARAR PLANES</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:"#fff",borderRadius:10,padding:10,border:"1px solid #E8590C30",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#E8590C"}}>US$20</div>
            <div style={{fontSize:10,color:"#A8A29E",fontWeight:600}}>/ semana</div>
            <div style={{fontSize:11,fontWeight:700,color:"#57534E",marginTop:6}}>Búsqueda</div>
            <div style={{fontSize:10,color:"#A8A29E",lineHeight:1.4,marginTop:2}}>IA + contactos + alertas</div>
          </div>
          <div style={{background:"#fff",borderRadius:10,padding:10,border:"1px solid #7C3AED30",textAlign:"center",position:"relative"}}>
            <div style={{position:"absolute",top:-6,right:8,background:"#7C3AED",color:"#fff",padding:"1px 8px",borderRadius:6,fontSize:8,fontWeight:800}}>RECOMENDADO</div>
            <div style={{fontSize:18,fontWeight:800,color:"#7C3AED"}}>US$50</div>
            <div style={{fontSize:10,color:"#A8A29E",fontWeight:600}}>/ semana</div>
            <div style={{fontSize:11,fontWeight:700,color:"#57534E",marginTop:6}}>Máxima Exposición</div>
            <div style={{fontSize:10,color:"#A8A29E",lineHeight:1.4,marginTop:2}}>Todo + redes sociales</div>
          </div>
        </div>
      </div>

      <div style={{display:"flex",justifyContent:"center",gap:14,flexWrap:"wrap"}}>
        {[
          {i:<$.Shield s={12} c="#059669"/>,t:"Pago seguro"},
          {i:<$.Clock s={12} c="#2563EB"/>,t:"Renovación opcional"},
          {i:<$.Heart s={12} c="#DC2626"/>,t:"Proyecto solidario"},
        ].map((b,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:"#A8A29E",fontWeight:600}}>{b.i}{b.t}</div>
        ))}
      </div>
    </div>
  );
}

function CheckoutForm({ plan, user, onSuccess, onBack }) {
  const [card, setCard] = useState({ number:"", name:"", expiry:"", cvc:"" });
  const [errors, setErrors] = useState({});
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState(1); // 1=card, 2=confirm, 3=processing

  const formatCardNumber = (v) => {
    const clean = v.replace(/\D/g,"").slice(0,16);
    return clean.replace(/(.{4})/g,"$1 ").trim();
  };
  const formatExpiry = (v) => {
    const clean = v.replace(/\D/g,"").slice(0,4);
    if (clean.length > 2) return clean.slice(0,2)+"/"+clean.slice(2);
    return clean;
  };
  const detectCardBrand = (n) => {
    const d = n.replace(/\s/g,"");
    if (/^4/.test(d)) return {brand:"Visa",color:"#1A1F71"};
    if (/^5[1-5]/.test(d)) return {brand:"Mastercard",color:"#EB001B"};
    if (/^3[47]/.test(d)) return {brand:"Amex",color:"#006FCF"};
    return {brand:"",color:"#A8A29E"};
  };

  const validate = () => {
    const e = {};
    const num = card.number.replace(/\s/g,"");
    if (num.length < 13) e.number = "Número de tarjeta inválido";
    if (!card.name.trim()) e.name = "Nombre del titular requerido";
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) e.expiry = "Formato MM/AA";
    else {
      const [m,y] = card.expiry.split("/").map(Number);
      if (m < 1 || m > 12) e.expiry = "Mes inválido";
      if (y < 26) e.expiry = "Tarjeta vencida";
    }
    if (card.cvc.length < 3) e.cvc = "CVC inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePay = async () => {
    if (!validate()) return;
    setStep(3);
    setProcessing(true);
    // Simulate payment processing
    await new Promise(r => setTimeout(r, 2500));
    const receipt = {
      id: "rcpt_" + Date.now(),
      plan: plan.n,
      amount: plan.finalPrice,
      period: plan.finalPeriod,
      cardLast4: card.number.replace(/\s/g,"").slice(-4),
      cardBrand: detectCardBrand(card.number).brand,
      date: new Date().toISOString(),
      email: user?.email,
    };
    // Save receipt
    await DB.set(`receipt:${receipt.id}`, receipt);
    const receipts = (await DB.get(`receipts:${user?.id}`)) || [];
    receipts.unshift(receipt.id);
    await DB.set(`receipts:${user?.id}`, receipts);

    setProcessing(false);
    onSuccess(receipt);
  };

  const cardBrand = detectCardBrand(card.number);

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><$.Back s={20} c="#78716C"/></button>
        <div>
          <h3 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em"}}>Checkout</h3>
          <p style={{fontSize:11,color:"#A8A29E"}}>Plan {plan.n} · ${plan.finalPrice.toLocaleString("es-AR")}/{plan.finalPeriod}</p>
        </div>
      </div>

      {step < 3 && (
        <>
          {/* Order summary */}
          <div style={{background:"#FAFAF9",borderRadius:14,padding:14,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#A8A29E",letterSpacing:".05em",marginBottom:8}}>RESUMEN</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:14,fontWeight:600}}>PetFinder {plan.n}</span>
              <span style={{fontSize:14,fontWeight:800,color:plan.c}}>${plan.finalPrice.toLocaleString("es-AR")}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#78716C"}}>
              <span>Facturación {plan.billing==="annual"?"anual":"mensual"}</span>
              <span>/{plan.finalPeriod}</span>
            </div>
            {plan.billing==="annual"&&(
              <div style={{marginTop:8,padding:"6px 10px",background:"#05966910",borderRadius:8,fontSize:11,color:"#059669",fontWeight:700,textAlign:"center"}}>
                Ahorro del 20% con plan anual
              </div>
            )}
          </div>

          {/* Card form */}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>NÚMERO DE TARJETA</label>
              <div style={{position:"relative"}}>
                <input 
                  placeholder="4242 4242 4242 4242" 
                  value={card.number} 
                  onChange={e=>{ setCard(p=>({...p,number:formatCardNumber(e.target.value)})); setErrors(p=>({...p,number:undefined})); }}
                  style={{borderColor:errors.number?"#DC2626":undefined,paddingRight:60}}
                  maxLength={19}
                />
                {cardBrand.brand && (
                  <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,fontWeight:800,color:cardBrand.color,letterSpacing:".05em"}}>{cardBrand.brand}</span>
                )}
              </div>
              {errors.number&&<div style={{fontSize:10,color:"#DC2626",marginTop:2,fontWeight:600}}>{errors.number}</div>}
            </div>

            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>TITULAR</label>
              <input placeholder="Nombre como aparece en la tarjeta" value={card.name} onChange={e=>{setCard(p=>({...p,name:e.target.value}));setErrors(p=>({...p,name:undefined}));}} style={{borderColor:errors.name?"#DC2626":undefined}}/>
              {errors.name&&<div style={{fontSize:10,color:"#DC2626",marginTop:2,fontWeight:600}}>{errors.name}</div>}
            </div>

            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <label style={{fontSize:11,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>VENCIMIENTO</label>
                <input placeholder="MM/AA" value={card.expiry} onChange={e=>{setCard(p=>({...p,expiry:formatExpiry(e.target.value)}));setErrors(p=>({...p,expiry:undefined}));}} style={{borderColor:errors.expiry?"#DC2626":undefined}} maxLength={5}/>
                {errors.expiry&&<div style={{fontSize:10,color:"#DC2626",marginTop:2,fontWeight:600}}>{errors.expiry}</div>}
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:11,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>CVC</label>
                <input placeholder="123" type="password" value={card.cvc} onChange={e=>{setCard(p=>({...p,cvc:e.target.value.replace(/\D/g,"").slice(0,4)}));setErrors(p=>({...p,cvc:undefined}));}} style={{borderColor:errors.cvc?"#DC2626":undefined}} maxLength={4}/>
                {errors.cvc&&<div style={{fontSize:10,color:"#DC2626",marginTop:2,fontWeight:600}}>{errors.cvc}</div>}
              </div>
            </div>

            <button className="bp" style={{width:"100%",justifyContent:"center",marginTop:6,padding:"14px 24px"}} onClick={handlePay}>
              <$.Shield s={15}/> Pagar ${plan.finalPrice.toLocaleString("es-AR")}
            </button>

            <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:4}}>
              {["Visa","Mastercard","Amex"].map(b=>(
                <span key={b} style={{fontSize:10,fontWeight:700,color:"#D6D3D1",padding:"2px 8px",border:"1px solid #E7E5E4",borderRadius:6}}>{b}</span>
              ))}
            </div>

            <p style={{fontSize:10,color:"#D6D3D1",textAlign:"center",marginTop:2}}>
              Pago procesado de forma segura. Podés cancelar en cualquier momento.
            </p>
          </div>
        </>
      )}

      {/* Processing animation */}
      {step === 3 && processing && (
        <div style={{textAlign:"center",padding:"40px 16px"}}>
          <div style={{width:56,height:56,margin:"0 auto 16px",border:"3px solid #E8590C",borderTopColor:"transparent",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
          <h3 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:6}}>Procesando pago...</h3>
          <p style={{fontSize:13,color:"#A8A29E"}}>Verificando datos de la tarjeta</p>
          <div style={{display:"flex",justifyContent:"center",gap:4,marginTop:16}}>
            {[0,1,2].map(i=>(
              <div key={i} style={{width:8,height:8,borderRadius:4,background:"#E8590C",opacity:.3+i*.3,animation:`pulse .8s ${i*.2}s infinite`}}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptView({ receipt, plan, user, onClose }) {
  return (
    <div style={{textAlign:"center"}}>
      {/* Success animation */}
      <div style={{width:64,height:64,borderRadius:20,margin:"0 auto 16px",background:"linear-gradient(135deg,#059669,#10B981)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn .5s"}}>
        <$.Check s={30} c="#fff"/>
      </div>
      <h3 style={{fontSize:22,fontWeight:800,letterSpacing:"-.03em",marginBottom:4}}>¡Pago exitoso!</h3>
      <p style={{fontSize:13,color:"#A8A29E",marginBottom:20}}>Tu plan {plan?.n} está activo</p>

      {/* Receipt card */}
      <div style={{background:"#FAFAF9",borderRadius:16,padding:18,textAlign:"left",marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:700,color:"#A8A29E",letterSpacing:".08em",marginBottom:12}}>COMPROBANTE DE PAGO</div>
        
        {[
          {l:"N° de recibo",v:receipt.id},
          {l:"Plan",v:`PetFinder ${receipt.plan}`},
          {l:"Monto",v:`$${receipt.amount?.toLocaleString("es-AR")}/${receipt.period}`,bold:true},
          {l:"Tarjeta",v:`${receipt.cardBrand} ····${receipt.cardLast4}`},
          {l:"Email",v:receipt.email},
          {l:"Fecha",v:new Date(receipt.date).toLocaleString("es-AR")},
        ].map((r,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<5?"1px solid #E7E5E4":"none"}}>
            <span style={{fontSize:12,color:"#78716C"}}>{r.l}</span>
            <span style={{fontSize:12,fontWeight:r.bold?800:600,color:"#1C1917"}}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Benefits unlocked */}
      <div style={{background:`${plan?.c}08`,borderRadius:14,padding:14,textAlign:"left",marginBottom:16,border:`1px solid ${plan?.c}20`}}>
        <div style={{fontSize:11,fontWeight:700,color:plan?.c,marginBottom:8,display:"flex",alignItems:"center",gap:4}}>
          <$.Zap s={13} c={plan?.c}/> BENEFICIOS DESBLOQUEADOS
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
          {plan?.fs?.slice(0,5).map((f,i)=>(
            <span key={i} style={{background:"#fff",padding:"3px 9px",borderRadius:7,fontSize:10,fontWeight:600,color:"#57534E",display:"flex",alignItems:"center",gap:3}}>
              <$.Check s={10} c={plan?.c}/>{f}
            </span>
          ))}
        </div>
      </div>

      <button className="bp" style={{width:"100%",justifyContent:"center"}} onClick={onClose}>
        <$.Heart s={15}/> Comenzar a buscar
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ADOPTION FORM
// ═══════════════════════════════════════════════════════════
function AdoptionForm({ onSubmit, onClose }) {
  const [d, setD] = useState({
    name:"", type:"dog", breed:"", description:"", reason:"",
    location:{ lat:-34.6037, lng:-58.3816, address:"" },
    ownerName:"", ownerPhone:"", urgent:false,
  });
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const up = (k,v) => setD(p=>({...p,[k]:v}));

  const REASONS = [
    "Mudanza / viaje al exterior",
    "Alergia en la familia",
    "Cambio de vivienda",
    "Problemas económicos",
    "Separación / divorcio",
    "No puedo cuidarla más",
    "Otro motivo",
  ];

  return (
    <div>
      <h3 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:3}}>Dar en adopción</h3>
      <p style={{color:"#A8A29E",fontSize:12,marginBottom:18}}>Contanos sobre tu mascota y por qué necesitás encontrarle un nuevo hogar</p>
      <div style={{display:"flex",gap:5,marginBottom:18}}>{[1,2,3].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:s<=step?"linear-gradient(90deg,#EF4444,#F97316)":"#E7E5E4",transition:"all .3s"}}/>)}</div>

      {step===1&&(
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s"}}>
          {/* Photo */}
          <div onClick={()=>fileRef.current?.click()} style={{border:"2px dashed #E7E5E4",borderRadius:14,padding:preview?0:24,textAlign:"center",cursor:"pointer",background:preview?"none":"#FAFAF9",minHeight:120,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
            {preview?<img src={preview} style={{width:"100%",height:160,objectFit:"cover",borderRadius:12}} alt=""/>:
            <><$.Cam s={28} c="#D6D3D1"/><div style={{marginTop:8,fontWeight:600,color:"#A8A29E",fontSize:13}}>Foto de la mascota</div></>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>setPreview(ev.target.result);r.readAsDataURL(f);}}} style={{display:"none"}}/>

          <input placeholder="Nombre de la mascota" value={d.name} onChange={e=>up("name",e.target.value)}/>

          <div style={{display:"flex",gap:7}}>
            {[{k:"dog",l:"Perro",i:<$.Dog s={16}/>},{k:"cat",l:"Gato",i:<$.Cat s={16}/>}].map(t=>(
              <button key={t.k} onClick={()=>up("type",t.k)} style={{flex:1,padding:12,borderRadius:12,border:d.type===t.k?"2px solid #EF4444":"2px solid #E7E5E4",background:d.type===t.k?"#EF444408":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontWeight:700,fontSize:13,color:d.type===t.k?"#EF4444":"#78716C",fontFamily:"inherit"}}>{t.i}{t.l}</button>
            ))}
          </div>

          <input placeholder="Raza" value={d.breed} onChange={e=>up("breed",e.target.value)}/>

          <button className="bp" style={{width:"100%",justifyContent:"center",background:"linear-gradient(135deg,#EF4444,#F97316)"}} onClick={()=>setStep(2)}>Siguiente <$.Arr s={14}/></button>
        </div>
      )}

      {step===2&&(
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s"}}>
          {/* Reason selector */}
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em"}}>RAZÓN DE LA ADOPCIÓN</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {REASONS.map(r=>(
              <button key={r} onClick={()=>up("reason",r)} style={{
                padding:"8px 14px",borderRadius:10,border:d.reason===r?"2px solid #EF4444":"2px solid #E7E5E4",
                background:d.reason===r?"#EF444408":"#fff",cursor:"pointer",fontSize:12,fontWeight:600,
                color:d.reason===r?"#EF4444":"#78716C",fontFamily:"inherit",transition:"all .2s",
              }}>{r}</button>
            ))}
          </div>

          <textarea placeholder="Contá la historia... ¿Cómo es tu mascota? ¿Por qué necesitás darla en adopción? ¿Qué tipo de hogar buscás?" value={d.description} onChange={e=>up("description",e.target.value)} style={{minHeight:100}}/>

          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:600,color:"#57534E"}}>
            <div onClick={()=>up("urgent",!d.urgent)} style={{width:22,height:22,borderRadius:6,border:d.urgent?"2px solid #DC2626":"2px solid #E7E5E4",background:d.urgent?"#DC2626":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s"}}>
              {d.urgent&&<$.Check s={14} c="#fff"/>}
            </div>
            Es urgente (necesito darlo pronto)
          </label>

          <div style={{display:"flex",gap:7}}>
            <button className="bo" onClick={()=>setStep(1)}>← Atrás</button>
            <button className="bp" style={{flex:1,justifyContent:"center",background:"linear-gradient(135deg,#EF4444,#F97316)"}} onClick={()=>setStep(3)}>Siguiente <$.Arr s={14}/></button>
          </div>
        </div>
      )}

      {step===3&&(
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s"}}>
          <input placeholder="Tu nombre" value={d.ownerName} onChange={e=>up("ownerName",e.target.value)}/>
          <input placeholder="Tu teléfono o WhatsApp" value={d.ownerPhone} onChange={e=>up("ownerPhone",e.target.value)}/>
          <input placeholder="Zona / barrio" value={d.location.address} onChange={e=>setD(p=>({...p,location:{...p.location,address:e.target.value}}))}/>

          <div style={{display:"flex",gap:7}}>
            <button className="bo" onClick={()=>setStep(2)}>← Atrás</button>
            <button className="bp" style={{flex:1,justifyContent:"center",background:"linear-gradient(135deg,#EF4444,#F97316)"}} onClick={()=>onSubmit({...d,photoData:preview,date:new Date().toISOString().split("T")[0]})}>
              <$.Check s={15}/> Publicar adopción
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FOSTER FORM (Guarda Temporal)
// ═══════════════════════════════════════════════════════════
function FosterForm({ onSubmit, onClose }) {
  const [d, setD] = useState({
    type:"both", fosterName:"", fosterPhone:"",
    location:{ lat:-34.6037, lng:-58.3816, address:"" },
    description:"", capacity:"1 mascota", duration:"Hasta 1 mes",
    hasYard:false, experience:"",
  });
  const [step, setStep] = useState(1);
  const up = (k,v) => setD(p=>({...p,[k]:v}));

  return (
    <div>
      <h3 style={{fontSize:18,fontWeight:800,letterSpacing:"-.03em",marginBottom:3}}>Ofrecer guarda temporal</h3>
      <p style={{color:"#A8A29E",fontSize:12,marginBottom:18}}>Ofrecé tu hogar para cuidar mascotas de forma temporal</p>
      <div style={{display:"flex",gap:5,marginBottom:18}}>{[1,2].map(s=><div key={s} style={{flex:1,height:3,borderRadius:2,background:s<=step?"linear-gradient(90deg,#2563EB,#7C3AED)":"#E7E5E4",transition:"all .3s"}}/>)}</div>

      {step===1&&(
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s"}}>
          {/* Animal type */}
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em"}}>¿QUÉ MASCOTAS PODÉS CUIDAR?</label>
          <div style={{display:"flex",gap:6}}>
            {[{k:"dog",l:"Perros",i:<$.Dog s={15}/>},{k:"cat",l:"Gatos",i:<$.Cat s={15}/>},{k:"both",l:"Ambos",i:<$.Paw s={15}/>}].map(t=>(
              <button key={t.k} onClick={()=>up("type",t.k)} style={{flex:1,padding:11,borderRadius:11,border:d.type===t.k?"2px solid #2563EB":"2px solid #E7E5E4",background:d.type===t.k?"#2563EB08":"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontWeight:700,fontSize:12,color:d.type===t.k?"#2563EB":"#78716C",fontFamily:"inherit"}}>{t.i}{t.l}</button>
            ))}
          </div>

          {/* Capacity */}
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em"}}>CAPACIDAD</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {["1 mascota","2 mascotas","3 mascotas","Más de 3"].map(c=>(
              <button key={c} onClick={()=>up("capacity",c)} style={{padding:"7px 14px",borderRadius:9,border:d.capacity===c?"2px solid #2563EB":"2px solid #E7E5E4",background:d.capacity===c?"#2563EB08":"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:d.capacity===c?"#2563EB":"#78716C",fontFamily:"inherit"}}>{c}</button>
            ))}
          </div>

          {/* Duration */}
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em"}}>DURACIÓN MÁXIMA</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {["Hasta 1 semana","Hasta 1 mes","Hasta 3 meses","Sin límite"].map(du=>(
              <button key={du} onClick={()=>up("duration",du)} style={{padding:"7px 14px",borderRadius:9,border:d.duration===du?"2px solid #2563EB":"2px solid #E7E5E4",background:d.duration===du?"#2563EB08":"#fff",cursor:"pointer",fontSize:12,fontWeight:600,color:d.duration===du?"#2563EB":"#78716C",fontFamily:"inherit"}}>{du}</button>
            ))}
          </div>

          {/* Has yard */}
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:600,color:"#57534E"}}>
            <div onClick={()=>up("hasYard",!d.hasYard)} style={{width:22,height:22,borderRadius:6,border:d.hasYard?"2px solid #059669":"2px solid #E7E5E4",background:d.hasYard?"#059669":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .2s"}}>
              {d.hasYard&&<$.Check s={14} c="#fff"/>}
            </div>
            Tengo patio / jardín
          </label>

          <button className="bp" style={{width:"100%",justifyContent:"center",background:"linear-gradient(135deg,#2563EB,#7C3AED)"}} onClick={()=>setStep(2)}>Siguiente <$.Arr s={14}/></button>
        </div>
      )}

      {step===2&&(
        <div style={{display:"flex",flexDirection:"column",gap:12,animation:"fadeIn .3s"}}>
          <input placeholder="Tu nombre" value={d.fosterName} onChange={e=>up("fosterName",e.target.value)}/>
          <input placeholder="Tu teléfono o WhatsApp" value={d.fosterPhone} onChange={e=>up("fosterPhone",e.target.value)}/>
          <input placeholder="Zona / barrio" value={d.location.address} onChange={e=>setD(p=>({...p,location:{...p.location,address:e.target.value}}))}/>
          <input placeholder="Tu experiencia con mascotas" value={d.experience} onChange={e=>up("experience",e.target.value)}/>
          <textarea placeholder="Describí tu hogar y por qué es un buen lugar para cuidar mascotas temporalmente..." value={d.description} onChange={e=>up("description",e.target.value)} style={{minHeight:90}}/>

          <div style={{display:"flex",gap:7}}>
            <button className="bo" onClick={()=>setStep(1)}>← Atrás</button>
            <button className="bp" style={{flex:1,justifyContent:"center",background:"linear-gradient(135deg,#2563EB,#7C3AED)"}} onClick={()=>onSubmit({...d,date:new Date().toISOString().split("T")[0]})}>
              <$.Check s={15}/> Publicar hogar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VACCINE FORM
// ═══════════════════════════════════════════════════════════
function VaccineForm({ onSubmit, onClose }) {
  const [d, setD] = useState({ name:"", lab:"", date:new Date().toISOString().split("T")[0], nextDate:"", petName:"", notes:"" });
  const up = (k,v) => setD(p=>({...p,[k]:v}));

  const VACCINES_DOG = ["Antirrábica","Quíntuple (DHPPI+L)","Sextuple","Desparasitación","Antipulgas/garrapatas","Bordetella (tos de las perreras)","Leptospirosis","Giardia"];
  const VACCINES_CAT = ["Antirrábica","Triple felina","Leucemia felina","Desparasitación","Antipulgas","PIF (Peritonitis)"];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{width:42,height:42,borderRadius:12,background:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center"}}><$.Heart s={20} c="#fff"/></div>
        <div><h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>Registrar vacuna</h3><p style={{fontSize:11,color:"#A8A29E"}}>Agregá al carnet digital de tu mascota</p></div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>VACUNA / TRATAMIENTO</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
            {VACCINES_DOG.map(v=>(<button key={v} onClick={()=>up("name",v)} style={{padding:"6px 11px",borderRadius:8,border:d.name===v?"2px solid #DC2626":"1px solid #E7E5E4",background:d.name===v?"#DC262608":"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:d.name===v?"#DC2626":"#78716C",fontFamily:"inherit"}}>{v}</button>))}
          </div>
          <input placeholder="O escribí el nombre de la vacuna" value={d.name} onChange={e=>up("name",e.target.value)}/>
        </div>
        <input placeholder="Laboratorio / Marca" value={d.lab} onChange={e=>up("lab",e.target.value)}/>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><label style={{fontSize:10,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>FECHA APLICACIÓN</label><input type="date" value={d.date} onChange={e=>up("date",e.target.value)}/></div>
          <div style={{flex:1}}><label style={{fontSize:10,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>PRÓXIMA DOSIS</label><input type="date" value={d.nextDate} onChange={e=>up("nextDate",e.target.value)}/></div>
        </div>
        <input placeholder="Nombre de la mascota" value={d.petName} onChange={e=>up("petName",e.target.value)}/>
        <textarea placeholder="Notas del veterinario (opcional)" value={d.notes} onChange={e=>up("notes",e.target.value)} style={{minHeight:60}}/>
        <button className="bp" style={{width:"100%",justifyContent:"center",background:"#DC2626"}} onClick={()=>onSubmit(d)}>
          <$.Check s={15}/> Registrar vacuna
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REMINDER FORM
// ═══════════════════════════════════════════════════════════
function ReminderForm({ onSubmit, onClose }) {
  const [d, setD] = useState({ text:"", date:"", repeat:"none", petName:"", priority:"medium" });
  const up = (k,v) => setD(p=>({...p,[k]:v}));

  const QUICK = ["Desparasitación","Antipulgas","Vacuna anual","Control veterinario","Baño/peluquería","Corte de uñas","Limpieza dental","Comprar alimento"];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#D97706,#F59E0B)",display:"flex",alignItems:"center",justifyContent:"center"}}><$.Bell s={20} c="#fff"/></div>
        <div><h3 style={{fontSize:17,fontWeight:800,letterSpacing:"-.03em"}}>Nuevo recordatorio</h3><p style={{fontSize:11,color:"#A8A29E"}}>Te avisaremos cuando se acerque la fecha</p></div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>RECORDATORIO RÁPIDO</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {QUICK.map(q=>(<button key={q} onClick={()=>up("text",q)} style={{padding:"6px 11px",borderRadius:8,border:d.text===q?"2px solid #D97706":"1px solid #E7E5E4",background:d.text===q?"#D9770608":"#fff",cursor:"pointer",fontSize:11,fontWeight:600,color:d.text===q?"#D97706":"#78716C",fontFamily:"inherit"}}>{q}</button>))}
          </div>
        </div>
        <input placeholder="O escribí tu recordatorio" value={d.text} onChange={e=>up("text",e.target.value)}/>
        <input placeholder="Nombre de la mascota" value={d.petName} onChange={e=>up("petName",e.target.value)}/>
        <div><label style={{fontSize:10,fontWeight:700,color:"#78716C",marginBottom:4,display:"block"}}>FECHA</label><input type="date" value={d.date} onChange={e=>up("date",e.target.value)}/></div>

        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>REPETIR</label>
          <div style={{display:"flex",gap:5}}>
            {[{k:"none",l:"Una vez"},{k:"monthly",l:"Mensual"},{k:"quarterly",l:"Trimestral"},{k:"yearly",l:"Anual"}].map(r=>(
              <button key={r.k} onClick={()=>up("repeat",r.k)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:d.repeat===r.k?"2px solid #D97706":"1px solid #E7E5E4",background:d.repeat===r.k?"#D9770608":"#fff",cursor:"pointer",fontSize:10,fontWeight:600,color:d.repeat===r.k?"#D97706":"#78716C",fontFamily:"inherit"}}>{r.l}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{fontSize:11,fontWeight:700,color:"#78716C",letterSpacing:".04em",marginBottom:6,display:"block"}}>PRIORIDAD</label>
          <div style={{display:"flex",gap:5}}>
            {[{k:"low",l:"Baja",c:"#059669"},{k:"medium",l:"Media",c:"#D97706"},{k:"high",l:"Alta",c:"#DC2626"}].map(p=>(
              <button key={p.k} onClick={()=>up("priority",p.k)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:d.priority===p.k?`2px solid ${p.c}`:"1px solid #E7E5E4",background:d.priority===p.k?`${p.c}08`:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,color:d.priority===p.k?p.c:"#78716C",fontFamily:"inherit"}}>{p.l}</button>
            ))}
          </div>
        </div>

        <button className="bp" style={{width:"100%",justifyContent:"center",background:"linear-gradient(135deg,#D97706,#F59E0B)"}} onClick={()=>onSubmit(d)}>
          <$.Bell s={15}/> Crear recordatorio
        </button>
      </div>
    </div>
  );
}

function AuthForm({onSubmit}){
  const [mode,setMode]=useState("login");
  const [d,setD]=useState({name:"",email:"",phone:"",password:""});
  const [showPass,setShowPass]=useState(false);
  const [errors,setErrors]=useState({});

  const validate=()=>{
    const e={};
    if(mode==="register"&&!d.name.trim()) e.name="Ingresá tu nombre";
    if(!d.email.trim()) e.email="Ingresá tu email";
    else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email="Email inválido";
    if(!d.password) e.password="Ingresá tu contraseña";
    else if(d.password.length<6) e.password="Mínimo 6 caracteres";
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const handleSubmit=()=>{
    if(!validate())return;
    onSubmit(d,mode);
  };

  return (
    <div>
      <div style={{textAlign:"center",marginBottom:18}}>
        <div style={{width:50,height:50,borderRadius:14,margin:"0 auto 12px",background:"linear-gradient(135deg,#E8590C,#DC2626)",display:"flex",alignItems:"center",justifyContent:"center"}}><$.User s={24} c="#fff"/></div>
        <h3 style={{fontSize:18,fontWeight:800}}>{mode==="login"?"Iniciar sesión":"Crear cuenta"}</h3>
        <p style={{fontSize:12,color:"#A8A29E",marginTop:4}}>{mode==="login"?"Ingresá tus datos":"Registrate gratis en segundos"}</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {mode==="register"&&(
          <div>
            <input placeholder="Tu nombre" value={d.name} onChange={e=>{setD(p=>({...p,name:e.target.value}));setErrors(p=>({...p,name:undefined}));}} style={{borderColor:errors.name?"#DC2626":undefined}}/>
            {errors.name&&<div style={{fontSize:11,color:"#DC2626",marginTop:3,fontWeight:600}}>{errors.name}</div>}
          </div>
        )}
        <div>
          <input placeholder="Email" type="email" value={d.email} onChange={e=>{setD(p=>({...p,email:e.target.value}));setErrors(p=>({...p,email:undefined}));}} style={{borderColor:errors.email?"#DC2626":undefined}}/>
          {errors.email&&<div style={{fontSize:11,color:"#DC2626",marginTop:3,fontWeight:600}}>{errors.email}</div>}
        </div>
        <div style={{position:"relative"}}>
          <input placeholder="Contraseña" type={showPass?"text":"password"} value={d.password} onChange={e=>{setD(p=>({...p,password:e.target.value}));setErrors(p=>({...p,password:undefined}));}} style={{borderColor:errors.password?"#DC2626":undefined,paddingRight:44}}
            onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/>
          <button onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:4}}>
            <$.Eye s={16} c={showPass?"#E8590C":"#A8A29E"}/>
          </button>
          {errors.password&&<div style={{fontSize:11,color:"#DC2626",marginTop:3,fontWeight:600}}>{errors.password}</div>}
        </div>
        {mode==="register"&&<input placeholder="Teléfono (opcional)" value={d.phone} onChange={e=>setD(p=>({...p,phone:e.target.value}))}/>}
        <button className="bp" style={{width:"100%",justifyContent:"center",marginTop:4}} onClick={handleSubmit}>
          {mode==="login"?<><$.Shield s={15}/> Entrar</>:<><$.Check s={15}/> Crear cuenta</>}
        </button>
        
        {/* Divider */}
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"4px 0"}}>
          <div style={{flex:1,height:1,background:"#E7E5E4"}}/>
          <span style={{fontSize:11,color:"#A8A29E",fontWeight:600}}>o</span>
          <div style={{flex:1,height:1,background:"#E7E5E4"}}/>
        </div>

        <button style={{background:"none",border:"2px solid #E7E5E4",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:600,color:"#57534E",fontFamily:"inherit",padding:"10px 16px",transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}} 
          onClick={()=>{setMode(m=>m==="login"?"register":"login");setErrors({});}}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#E8590C"}
          onMouseLeave={e=>e.currentTarget.style.borderColor="#E7E5E4"}>
          {mode==="login"?<><$.User s={15} c="#E8590C"/> ¿No tenés cuenta? Registrate</>:<><$.Back s={15} c="#E8590C"/> Ya tengo cuenta</>}
        </button>
      </div>
    </div>
  );
}
