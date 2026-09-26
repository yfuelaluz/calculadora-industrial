const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sirve de forma automática tus páginas públicas blindadas de la calculadora industrial
app.use(express.static(path.join(__dirname, 'public')));

// --- BASE DE DATOS MAESTRA PROTEGIDA (SOLO ENTRADAS WEBPAY VALIDAS) ---
const listaClientesPagados = {};

// FORZAR MURO DE ACCESO: Si entran a la raíz de la web, van directo al login obligatorio
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// --- VERIFICADOR INTEGRAL DE ACCESO (REVISA CORREO Y FECHA VIGENTE) ---
app.post('/api/verificar-usuario', (req, res) => {
  const { email } = req.body;
  const usuario = listaClientesPagados[email];
  const ahora = new Date();

  console.log(`\n🔍 Consulta de acceso industrial en vivo para: ${email}`);

  if (usuario && usuario.activo) {
    if (usuario.expiracion === null) {
      console.log(`✅ ACCESO INDUSTRIAL CONCEDIDO: ${email} posee plan ilimitado.`);
      return res.json({ acceso: true, mensaje: `Acceso concedido - ${usuario.plan}` });
    }

    const tiempoRestante = usuario.expiracion - ahora;
    const diasRestantes = Math.ceil(tiempoRestante / (1000 * 60 * 60 * 24));

    if (diasRestantes > 0) {
      let mensajeAviso = `Acceso concedido - Días restantes: ${diasRestantes}`;
      if (diasRestantes <= 3) {
        console.log(`⚠️ ALERTA: Al cliente ${email} le quedan solo ${diasRestantes} días.`);
        mensajeAviso += `. ¡Su próximo cobro automático de Webpay está cerca!`;
      }
      console.log(`✅ ACCESO INDUSTRIAL CONCEDIDO: ${email} vigente por ${diasRestantes} días.`);
      res.json({ acceso: true, mensaje: mensajeAviso });
    } else {
      usuario.activo = false;
      console.log(`❌ ACCESO INDUSTRIAL CORTADO: La suscripción de ${email} expiró.`);
      res.json({ acceso: false, mensaje: "Su suscripción ha expirado. Por favor, renueve su plan." });
    }
  } else {
    console.log(`❌ ACCESO INDUSTRIAL RECHAZADO: Correo no registra membresías vigentes.`);
    res.json({ acceso: false, mensaje: "Membresía inactiva o no registrada en Webpay." });
  }
});

// --- RECEPTOR AUTOMÁTICO DE PAGOS DESDE WEBPAY (FLOW WEBHOOK) ---
app.post('/api/flow-notificacion', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send("Token faltante");

  try {
    const urlValidacion = `https://flow.cl{process.env.FLOW_API_KEY}&token=${token}`;
    const datosTransaccion = await axios.get(urlValidacion);
    
    if (datosTransaccion.data.status === "active" || datosTransaccion.data.status === "paid") {
      const emailNuevoCliente = datosTransaccion.data.email;
      const idPlanFlow = datosTransaccion.data.planId; 
      
      let diasVigencia = 30; 
      let nombrePlan = `Plan Industrial Flow (${idPlanFlow})`;

      if (idPlanFlow === "Semanal") { diasVigencia = 7; nombrePlan = "Suscripción Semanal Industrial"; }
      if (idPlanFlow === "Quincenal") { diasVigencia = 15; nombrePlan = "Suscripción Quincenal Industrial"; }
      if (idPlanFlow === "Mensual") { diasVigencia = 30; nombrePlan = "Suscripción Mensual Industrial"; }
      if (idPlanFlow === "Anual") { diasVigencia = 365; nombrePlan = "Suscripción Anual Industrial"; }
      if (idPlanFlow === "Vitalicio") { diasVigencia = null; nombrePlan = "Membresía Vitalicia Industrial"; }

      const fechaExpiracion = diasVigencia ? new Date() : null;
      if (fechaExpiracion) {
        fechaExpiracion.setDate(fechaExpiracion.getDate() + diasVigencia);
      }

      listaClientesPagados[emailNuevoCliente] = { 
        activo: true, 
        plan: nombrePlan,
        expiracion: fechaExpiracion
      };
      
      console.log(`🚀 ¡REGISTRO INDUSTRIAL AUTOMÁTICO! Cliente: ${emailNuevoCliente} | Plan: ${nombrePlan}`);
    }
    res.status(200).send("OK");
  } catch (error) {
    console.log("Error al procesar la notificación automática de Webpay/Flow Industrial");
    res.status(500).send("Error interno");
  }
});

// --- ENLACES DE RETORNO OFICIALES ---
app.get('/pago-exitoso', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pago-exitoso.html'));
});

app.get('/pago-cancelado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pago-cancelado.html'));
});

app.listen(PORT, () => {
  console.log("=================================================");
  console.log(`🚀 SERVIDOR CALCULADORA INDUSTRIAL ACTIVO EN PUERTO ${PORT}`);
  console.log("=================================================");
});
