require('dotenv').config(); // ← AGREGAR ESTA LÍNEA
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Y cambiar a SUPABASE_ANON_KEY o cambiar el .env

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase URL or Key");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;