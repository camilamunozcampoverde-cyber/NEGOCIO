import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  ChevronLeft, 
  Cake, 
  Check, 
  Smartphone, 
  ArrowRight,
  Info,
  Layers,
  Star,
  Clock,
  Calendar,
  X,
  Minus,
  Plus,
  Camera,
  Upload
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const API_URL = "https://script.google.com/macros/s/AKfycbwleSS4UhEdj1WOmoNXUGGbXiW-_Vt_45Nn9KeU9u9y_ifLdSsK0BGCmBIap-0Ofeaz/exec";

// --- TIPOS ---
type Step = 'WELCOME' | 'SIZE' | 'FLAVORS' | 'DESIGN_ANALYSIS' | 'CHECKOUT' | 'SUCCESS';

interface OrderState {
  size: { shape: string; name: string; price: number; isDouble: boolean } | null;
  baseFlavor: { name: string; price: number; image: string } | null;
  topFlavor: { name: string; price: number; image: string } | null;
  baseFillings: { name: string; price: number }[];
  topFillings: { name: string; price: number }[];
  selectedExtras: { name: string; price: number }[];
  clientName: string;
  deliveryDate: string;
  deliveryTime: string;
  aiDetectedExtras: { name: string; price: number }[];
  designImage: string | null;
  designAnalysis: string | null;
  isAiAnalysisAccepted: boolean;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [sheetsData, setSheetsData] = useState<any>(null);
  const [step, setStep] = useState<Step>('WELCOME');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [order, setOrder] = useState<OrderState>({
    size: null,
    baseFlavor: null,
    topFlavor: null,
    baseFillings: [],
    topFillings: [],
    selectedExtras: [],
    clientName: '',
    deliveryDate: '',
    deliveryTime: '09:00',
    aiDetectedExtras: [],
    designImage: null,
    designAnalysis: null,
    isAiAnalysisAccepted: false
  });

  const [activeOverlay, setActiveOverlay] = useState<'BASE' | 'TOP' | 'EXTRAS' | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string>("");
  const [isFinishing, setIsFinishing] = useState(false);

  // --- NAVEGACIÓN Y SCROLL ---
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // --- DATA FETCHING ---
  useEffect(() => {
    setIsLoadingData(true);
    fetch(API_URL)
      .then(res => res.json())
      .then(json => {
        setSheetsData(json);
        setIsLoadingData(false);
      })
      .catch(err => {
        console.error("Error cargando Sheets:", err);
        setIsLoadingData(false);
      });
  }, []);

  const getImageUrl = (name: string) => {
    if (!Array.isArray(sheetsData?.Imagenes)) return "https://images.unsplash.com/photo-1578985545062-69928b1d9587?q=80&w=1000&auto=format&fit=crop";
    const imgRow = sheetsData.Imagenes.find((img: any) => img.Producto === name);
    return imgRow?.Imagen || "https://images.unsplash.com/photo-1578985545062-69928b1d9587?q=80&w=1000&auto=format&fit=crop";
  };

  // --- LÓGICA DE PRECIOS ---
  const calculateTotal = () => {
    let total = 0;
    
    if (!order.size) return 0;

    if (order.size.isDouble) {
      // Para dos pisos, el precio base es la suma de los sabores/dimensiones de cada tier
      // Si no se ha elegido sabor aún, usamos el primero de la lista para mostrar un "Desde..."
      const baseOptions = getFlavorsForSelectedSize('BASE');
      const topOptions = getFlavorsForSelectedSize('TOP');
      
      const basePrice = order.baseFlavor?.price ?? (baseOptions[0]?.price || 0);
      const topPrice = order.topFlavor?.price ?? (topOptions[0]?.price || 0);
      
      total += basePrice + topPrice;
    } else {
      // Para tortas simples, el precio lo define el sabor (que incluye el base del tamaño)
      // O el precio base definido en Step 1 si aún no se selecciona sabor
      total += order.baseFlavor ? order.baseFlavor.price : (order.size.price || 0);
    }
    
    // Sumamos los extras seleccionados manualmente
    total += order.selectedExtras.reduce((acc, e) => acc + (e.price || 0), 0);
    
    // Sumamos extras detectados por la IA (Tasador) - Solo si el cliente aceptó la tasación
    if (order.isAiAnalysisAccepted) {
      const aiExtrasTotal = (order.aiDetectedExtras || []).reduce((acc, e) => acc + (Number(e.price) || 0), 0);
      total += aiExtrasTotal;
    }
    
    // Sumamos los rellenos
    total += order.baseFillings.reduce((acc, f) => acc + (f.price || 0), 0);
    total += order.topFillings.reduce((acc, f) => acc + (f.price || 0), 0);

    return total;
  };

  const isConfigValid = () => {
    if (!order.size) return false;
    if (!order.baseFlavor || order.baseFillings.length < 1) return false;
    if (order.size.isDouble && (!order.topFlavor || order.topFillings.length < 1)) return false;
    return true;
  };

  const finalizeOrder = async () => {
    if (isFinishing) return;
    setIsFinishing(true);

    const total = calculateTotal();
    const abono = (total / 2).toFixed(2);
    
    const formaTamaño = order.size?.name || '';
    const saborElegido = order.size?.isDouble 
      ? `${order.baseFlavor?.name} (Abajo) y ${order.topFlavor?.name} (Arriba)` 
      : order.baseFlavor?.name || '';

    const formatFillings = (fillings: { name: string; price: number }[]) => {
      const counts: { [key: string]: number } = {};
      fillings.forEach(f => counts[f.name] = (counts[f.name] || 0) + 1);
      return Object.entries(counts).map(([name, count]) => count > 1 ? `${count}x ${name}` : name).join(', ');
    };

    const rellenosBase = formatFillings(order.baseFillings);
    const rellenosCima = order.size?.isDouble ? formatFillings(order.topFillings) : '';
    const rellenosMsj = order.size?.isDouble 
      ? `Abajo: ${rellenosBase} | Arriba: ${rellenosCima}` 
      : rellenosBase;

    const aiExtras = order.isAiAnalysisAccepted ? order.aiDetectedExtras : [];
    const extrasStr = [...order.selectedExtras, ...aiExtras].length > 0 
      ? [...order.selectedExtras, ...aiExtras].map(e => e.name).join(', ') 
      : 'Ninguno';

    const datosPedido = {
      nombre: order.clientName,
      fechaEntrega: order.deliveryDate,
      hora: order.deliveryTime,
      detalle: `${formaTamaño} - Sabores: ${saborElegido}`,
      rellenos: rellenosMsj,
      extras: extrasStr,
      total: `$${total.toFixed(2)}`,
      analisisIA: order.designAnalysis || 'N/A'
    };

    let finalMessage = "";

    try {
      // Intentar guardar en Google Sheets
      const response = await fetch(API_URL, { 
        method: 'POST', 
        body: JSON.stringify(datosPedido) 
      });
      const resultado = await response.json();

      finalMessage = `¡Hola! Vengo de la página web de *Pan & Canela* 🥨✨\n\n` +
        `*Orden #:* ${resultado.orden || 'Registrada'}\n` +
        `*Cliente:* ${order.clientName}\n` +
        `*Entrega:* ${order.deliveryDate} a las ${order.deliveryTime}\n\n` +
        `*Detalle:* ${formaTamaño}\n` +
        `- Sabores: ${saborElegido}\n` +
        `*Rellenos:* ${rellenosMsj}\n` +
        (extrasStr !== 'Ninguno' ? `*Extras:* ${extrasStr}\n` : '') +
        `\n*TOTAL:* $${total.toFixed(2)}\n` +
        `📌 *Abono 50%:* *$${abono}* para confirmar tu pedido.`;
    } catch (e) {
      console.error("Error al guardar en Sheets:", e);
      // Fallback
      finalMessage = `¡Hola! Vengo de la página web (vía respaldo) de *Pan & Canela* 🥨✨\n\n` +
        `*Cliente:* ${order.clientName}\n` +
        `*Entrega:* ${order.deliveryDate} a las ${order.deliveryTime}\n\n` +
        `*Detalle:* ${formaTamaño}\n` +
        `- Sabores: ${saborElegido}\n` +
        `*Rellenos:* ${rellenosMsj}\n` +
        (extrasStr !== 'Ninguno' ? `*Extras:* ${extrasStr}\n` : '') +
        `\n*TOTAL:* $${total.toFixed(2)}\n`;
    } finally {
      const whatsappLink = `https://wa.me/593985482535?text=${encodeURIComponent(finalMessage)}`;
      window.open(whatsappLink, '_blank');
      setIsFinishing(false);
    }
  };

  // Ayudante para obtener los sabores y precios del tamaño seleccionado
  const getFlavorsForSelectedSize = (floor: 'BASE' | 'TOP' = 'BASE') => {
    if (!sheetsData || !order.size) return [];
    
    let targetShape = order.size.shape;
    let targetPortionName = order.size.name.split(' ')[0]; // Ej: "15" de "15 porciones"

    // --- LÓGICA ESPECIAL PARA DOS PISOS ---
    if (order.size.isDouble) {
      targetShape = "Circular"; // Los pisos de las tortas dobles siempre son circulares
      const totalPortions = parseInt(order.size.name.split(' ')[0]);
      
      // Mapeo dinámico de porciones por piso para tortas de dos niveles
      if (totalPortions === 30) {
        targetPortionName = floor === 'BASE' ? "20" : "10";
      } else if (totalPortions === 45) {
        targetPortionName = floor === 'BASE' ? "30" : "15";
      } else if (totalPortions === 60) {
        targetPortionName = floor === 'BASE' ? "30" : "30";
      } else if (totalPortions === 70 || totalPortions === 75) {
        targetPortionName = floor === 'BASE' ? "45" : "30";
      } else {
        // Fallback genérico si no coincide exactamente
        targetPortionName = floor === 'BASE' ? "30" : "15";
      }
    }

    const shapeData = sheetsData[targetShape];
    if (!Array.isArray(shapeData)) return [];

    // Buscamos la fila que coincide con el nombre de porciones mapeado
    const row = shapeData.find((r: any) => {
      const porcionKey = Object.keys(r).find(k => k.toLowerCase().includes('porcion'));
      return r[porcionKey]?.toString() === targetPortionName;
    });

    if (!row) return [];

    const flavors = Object.keys(row).filter(k => 
      !k.toLowerCase().includes('porcion') && 
      !k.toLowerCase().includes('imagen')
    );

    return flavors.map(name => ({
      name,
      price: parseFloat(row[name]) || 0,
      image: getImageUrl(name)
    }));
  };

  const analyzeImage = async (base64Img: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      // Consolidamos la lista de adornos específicos del usuario
      const baseAdornosMap: { [key: string]: number } = {
        "Perlas": 1.5,
        "Mariposas": 1.0,
        "Flores naturales": 1.0,
        "Topper Personalizado": 2.0
      };
      
      const adornosListStr = Object.entries(baseAdornosMap).map(([name, price]) => `${name}: $${price}`).join(', ');
      
      const prompt = `Actúa como la asistente inteligente de tasación para Pan & Canela. Tu objetivo es analizar la imagen de referencia para calcular costos extras.

REGLAS DE NEGOCIO:
- SOLO trabajamos con crema/ganache. Si detectas FONDANT, rechaza amablemente.
- PRECIOS DE EXTRAS (Súmalos si los ves):
  ${adornosListStr}

FORMATO DE RESPUESTA:
1. Un breve informe descriptivo (sin pasos numerados).
2. Una lista clara llamada "DETALLES DETECTADOS:" con los nombres de los adornos.
3. Un bloque JSON final EXACTAMENTE así:
   json_data: {"extras": [{"name": "nombre", "price": valor}, ...]}

Sé sofisticada y precisa.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: base64Img.split(',')[1], mimeType: "image/png" } },
            { text: prompt }
          ]
        }
      });
      const responseText = response.text || "";
      
      // Separar el informe del JSON técnico
      const reportText = responseText.split('json_data:')[0].trim();

      // Intentar extraer el JSON de la respuesta
      const jsonMatch = responseText.match(/json_data:\s*({[\s\S]*?})/);
      let detectedExtras: {name: string, price: number}[] = [];

      if (jsonMatch) {
        try {
          // Limpieza de JSON: Eliminar posibles comentarios o caracteres invisibles que la IA a veces añade
          let cleanJson = jsonMatch[1]
            .replace(/,\s*}/g, '}') // Eliminar comas finales en objetos
            .replace(/,\s*]/g, ']') // Eliminar comas finales en arrays
            .replace(/([a-zA-Z0-9_]+):/g, '"$1":'); // Asegurar comillas en los keys
            
          const parsed = JSON.parse(cleanJson);
          detectedExtras = parsed.extras || [];
        } catch (e) {
          console.warn("Error parsing AI JSON, using fallback keyword detection:", e);
        }
      } 
      
      // FALLBACK REFORZADO: Si el JSON falló o está vacío, escaneamos el texto por palabras clave
      if (detectedExtras.length === 0) {
        const lowerCaseResponse = responseText.toLowerCase();
        Object.entries(baseAdornosMap).forEach(([key, price]) => {
          if (lowerCaseResponse.includes(key.toLowerCase())) {
            // Evitar duplicados si ya se detectó algo por milagro
            if (!detectedExtras.find(e => e.name === key)) {
              detectedExtras.push({ name: key, price: price });
            }
          }
        });
      }

      const isFondant = responseText.toLowerCase().includes("no trabajamos con fondant");

      setOrder(prev => ({
        ...prev,
        designImage: base64Img,
        designAnalysis: reportText,
        aiDetectedExtras: detectedExtras,
        isAiAnalysisAccepted: false
      }));

      if (isFondant) {
        setAnalysisError(reportText);
      }

    } catch (err) {
      console.error("Error en análisis IA:", err);
      setAnalysisError("Lo sentimos, no pudimos analizar la imagen en este momento. Puedes continuar y enviarnos el diseño por WhatsApp.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        analyzeImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-petroleo flex flex-col items-center justify-center p-10 text-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-gold/20 border-t-gold rounded-full mb-8 shadow-[0_0_50px_-10px_rgba(212,175,55,0.3)]"
        />
        <h2 className="font-serif text-3xl text-gold mb-2 italic">Cargando Dulzura</h2>
        <p className="text-white/30 text-[10px] uppercase tracking-[0.5em] font-black tracking-tighter">Pan & Canela • Pastelería Boutique</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen max-w-lg mx-auto bg-petroleo text-white font-sans overflow-x-hidden selection:bg-gold selection:text-petroleo">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(197,160,89,0.2),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(197,160,89,0.1),transparent)]" />
      </div>

      <AnimatePresence mode="wait">
        {step === 'WELCOME' && (
          <motion.div 
            key="welcome"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="relative flex flex-col items-center justify-center min-h-screen text-center p-8 z-10"
          >
             <div className="absolute inset-0 z-0 overflow-hidden">
                <img src="https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=2000&auto=format&fit=crop" 
                     className="w-full h-full object-cover opacity-30 grayscale hover:grayscale-0 transition-all duration-1000 scale-110" alt="bg" />
                <div className="absolute inset-0 bg-petroleo/80" />
            </div>
            
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="relative z-10">
              <h1 className="font-serif text-6xl italic text-gold mb-4 leading-tight">Pan & Canela</h1>
              <p className="text-white/60 font-light text-lg mb-16 tracking-[0.2em] uppercase text-sm">Arte en Pastelería</p>
              <button 
                onClick={() => setStep('SIZE')}
                className="group relative px-12 py-5 bg-gold text-petroleo font-black rounded-full text-sm tracking-[0.3em] overflow-hidden transition-all active:scale-95"
              >
                <span className="relative z-10">EMPEZAR PEDIDO</span>
                <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </motion.div>
          </motion.div>
        )}

        {step === 'SIZE' && (
          <motion.div 
            key="size"
            initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }}
            className="p-8 pt-24 min-h-screen z-10 relative"
          >
            <h2 className="text-gold uppercase tracking-[0.4em] text-[10px] font-black mb-2 italic">Colección 2026</h2>
            <h3 className="font-serif text-4xl mb-12 italic">Elige la Dimensión</h3>
            
            <div className="space-y-8">
              {sheetsData ? (
                Object.keys(sheetsData)
                  .filter(key => 
                    !['Rellenos', 'Extras', 'Imagenes', 'Pedidos Recibidos', 'Adornos'].includes(key) && 
                    Array.isArray(sheetsData[key])
                  )
                  .map(shape => (
                    <div key={shape} className="space-y-4">
                      <h4 className="text-white/20 text-[10px] uppercase tracking-[0.5em] font-black flex items-center gap-4">
                        {shape.replace('_', ' ')} <span className="flex-1 h-[1px] bg-white/5" />
                      </h4>
                      <div className="grid gap-4">
                        {sheetsData[shape].map((row: any, idx: number) => {
                          const porcionKey = Object.keys(row).find(k => k.toLowerCase().includes('porcion')) || '';
                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                const foundPrice = Object.values(row).find(v => typeof v === 'number' && v > 0) as number;
                                setOrder({ ...order, size: { shape, name: `${row[porcionKey]} porciones`, price: foundPrice || 0, isDouble: shape === 'Dos_Pisos' } });
                                setStep('FLAVORS');
                              }}
                              className="flex items-center justify-between p-7 glass-morphism rounded-[2.5rem] hover:bg-white/5 transition-all text-left group border-white/5"
                            >
                              <div className="flex items-center gap-5 text-gold">
                                <div className="p-4 bg-gold/5 rounded-2xl group-hover:bg-gold group-hover:text-petroleo transition-all duration-500">
                                  {shape === 'Dos_Pisos' ? <Layers size={22} /> : <Cake size={22} />}
                                </div>
                                <div>
                                  <p className="font-black text-lg tracking-tight group-hover:text-gold transition-colors">{row[porcionKey]} porciones</p>
                                  <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest italic">{shape.replace('_', ' ')}</p>
                                </div>
                              </div>
                              <div className="p-2 bg-white/5 rounded-full group-hover:bg-gold group-hover:translate-x-2 transition-all">
                                <ChevronRight className="text-white/20 group-hover:text-petroleo" size={16} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="flex flex-col items-center justify-center p-20 gap-4 opacity-30">
                  <div className="w-10 h-10 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
                  <p className="text-[10px] font-black tracking-widest uppercase">Cargando dimensiones...</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === 'FLAVORS' && (
          <motion.div 
            key="flavors"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col min-h-screen pt-24 pb-48 z-10 relative"
          >
            <div className="px-8 mb-4">
              <h2 className="text-gold uppercase tracking-[0.4em] text-[10px] font-black mb-2 italic">Configuración</h2>
              <h3 className="font-serif text-3xl italic">
                {order.size?.isDouble ? 'Sabor para la Base' : 'Elige tu Sabor'}
              </h3>
            </div>

            <div className="snap-x flex overflow-x-auto no-scrollbar gap-5 px-8 py-5">
              {getFlavorsForSelectedSize('BASE').map((f) => {
                const isSelected = order.baseFlavor?.name === f.name;
                return (
                  <div key={f.name} className="snap-center shrink-0 w-[85%] relative aspect-[3/4] rounded-[3rem] overflow-hidden group shadow-2xl transition-transform active:scale-95 border border-white/5">
                    <img src={f.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-125" alt={f.name} />
                    <div className="absolute inset-0 bg-gradient-to-t from-petroleo/90 via-petroleo/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-8 text-center sm:text-left">
                      <h4 className="font-serif text-3xl mb-1 italic">{f.name}</h4>
                      <p className="text-gold/80 font-black text-xs uppercase tracking-[0.2em] mb-8 italic">
                        {f.price > 0 ? `Sabor Premium: +$${f.price.toFixed(2)}` : 'Sabor Gourmet'}
                      </p>
                      <button 
                        onClick={() => {
                          setOrder({ 
                            ...order, 
                            baseFlavor: { name: f.name, price: f.price, image: f.image },
                            baseFillings: [] 
                          });
                          setActiveOverlay('BASE');
                        }}
                        className={`w-full py-4 rounded-2xl font-black text-[10px] tracking-[0.3em] uppercase transition-all duration-500 border ${
                          isSelected ? 'bg-gold text-petroleo border-gold' : 'bg-white/10 backdrop-blur-xl border-white/20'
                        }`}
                      >
                        {isSelected ? 'EDITAR RELLENOS' : 'SELECCIONAR'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {order.size?.isDouble && (
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                <div className="px-8 mb-4 mt-12">
                  <h3 className="font-serif text-3xl italic">Sabor para la Cima</h3>
                </div>
                <div className="snap-x flex overflow-x-auto no-scrollbar gap-5 px-8 py-5">
                  {getFlavorsForSelectedSize('TOP').map((f) => {
                    const isSelected = order.topFlavor?.name === f.name;
                    return (
                      <div key={`top-${f.name}`} className="snap-center shrink-0 w-[85%] relative aspect-[3/4] rounded-[3rem] overflow-hidden group shadow-2xl transition-transform active:scale-95 border border-white/5">
                        <img src={f.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-125" alt={f.name} />
                        <div className="absolute inset-0 bg-gradient-to-t from-petroleo/90 via-petroleo/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-8 text-center sm:text-left">
                          <h4 className="font-serif text-3xl mb-1 italic">{f.name}</h4>
                          <p className="text-gold/80 font-black text-xs uppercase tracking-[0.2em] mb-8 italic">
                            {f.price > 0 ? `Sabor Premium: +$${f.price.toFixed(2)}` : 'Sabor Gourmet'}
                          </p>
                          <button 
                            onClick={() => {
                              setOrder({ 
                                ...order, 
                                topFlavor: { name: f.name, price: f.price, image: f.image },
                                topFillings: [] 
                              });
                              setActiveOverlay('TOP');
                            }}
                            className={`w-full py-4 rounded-2xl font-black text-[10px] tracking-[0.3em] uppercase transition-all duration-500 border ${
                              isSelected ? 'bg-gold text-petroleo border-gold' : 'bg-white/10 backdrop-blur-xl border-white/20'
                            }`}
                          >
                            {isSelected ? 'EDITAR RELLENOS' : 'SELECCIONAR'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            <div className="px-8 mt-16 mb-20">
              <button 
                onClick={() => setActiveOverlay('EXTRAS')}
                className="w-full p-8 glass-morphism rounded-[2.5rem] flex items-center justify-between group border-gold/20 bg-gold/5"
              >
                <div className="text-left">
                  <p className="text-gold font-black text-[10px] uppercase tracking-[0.3em] mb-2 italic">Complementos de Lujo</p>
                  <p className="font-serif text-2xl italic tracking-tight">¿Algún detalle extra?</p>
                </div>
                <div className="bg-gold text-petroleo p-3 rounded-full shadow-[0_0_20px_rgba(197,160,89,0.3)] transition-transform group-hover:rotate-12 group-hover:scale-110">
                    <Star size={22} className="fill-current" />
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {step === 'DESIGN_ANALYSIS' && (
          <motion.div 
            key="design_analysis"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
            className="p-8 pt-32 min-h-screen pb-48 z-10 relative flex flex-col items-center text-center"
          >
            <div className="mb-10">
              <h2 className="text-gold uppercase tracking-[0.4em] text-[10px] font-black mb-2 italic">Tasación Inteligente</h2>
              <h3 className="font-serif text-4xl italic">Sube tu Diseño</h3>
              <p className="text-white/40 font-light mt-4 text-sm leading-relaxed italic">
                Analizaremos tu imagen para detectar decoraciones extras y asegurar que podamos realizar tu pedido.
              </p>
            </div>

            {!order.designImage && !isAnalyzing ? (
              <div className="grid gap-6 w-full max-w-sm">
                <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gold/20 rounded-[3rem] bg-gold/5 cursor-pointer hover:bg-gold/10 transition-all group">
                  <div className="w-16 h-16 bg-gold text-petroleo rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Camera size={28} strokeWidth={3} />
                  </div>
                  <span className="font-black text-[10px] tracking-[0.3em] uppercase mb-1">Subir Referencia</span>
                  <span className="text-[10px] opacity-30 italic">Click para abrir galería</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>

                <button 
                  onClick={() => setStep('CHECKOUT')}
                  className="p-8 bg-white/5 border border-white/5 rounded-[3rem] flex items-center justify-between group hover:border-gold/30 transition-all font-sans text-left"
                >
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Sin Referencia</p>
                    <p className="text-sm font-bold italic">Pasar diseño por WhatsApp</p>
                  </div>
                  <div className="p-3 bg-petroleo rounded-full text-gold group-hover:translate-x-2 transition-transform">
                    <ChevronRight size={18} strokeWidth={3} />
                  </div>
                </button>
              </div>
            ) : isAnalyzing ? (
              <div className="flex flex-col items-center justify-center p-20 gap-8">
                 <div className="relative">
                    <div className="w-24 h-24 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
                    <Star className="absolute inset-0 m-auto text-gold animate-pulse" size={32} />
                 </div>
                 <div className="space-y-2">
                   <p className="font-black text-[10px] uppercase tracking-[0.5em] text-gold animate-pulse">Analizando...</p>
                   <p className="text-[10px] opacity-40 italic">La IA está tasando los detalles artesanales</p>
                 </div>
              </div>
            ) : (
              <div className="w-full space-y-10">
                <div className="relative w-full aspect-video rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 group">
                  <img src={order.designImage!} className="w-full h-full object-cover" alt="Diseño" />
                  <button 
                    onClick={() => setOrder(prev => ({ ...prev, designImage: null, designAnalysis: null, aiDetectedExtras: [], isAiAnalysisAccepted: false }))}
                    className="absolute top-4 right-4 p-3 bg-petroleo/80 backdrop-blur-md rounded-full text-white/50 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>

                {order.designAnalysis && (
                  <div className="bg-gold/5 border border-gold/20 p-8 rounded-[2.5rem] text-left relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                      <Star size={80} />
                    </div>
                    <div className="relative z-10">
                      <h4 className="font-black text-[10px] uppercase tracking-[0.4em] text-gold mb-6 italic">Informe de Tasación</h4>
                      <div className="text-xs text-white/70 leading-relaxed font-light italic whitespace-pre-wrap mb-8">
                        {order.designAnalysis}
                      </div>
                      
                      {order.aiDetectedExtras.length > 0 && (
                        <div className="pt-6 border-t border-white/5">
                           <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-white/30">Cargos Adicionales Detectados:</p>
                           <div className="flex flex-wrap gap-2">
                             {order.aiDetectedExtras.map((e, idx) => (
                               <div key={idx} className="px-3 py-1 bg-gold/10 text-gold rounded-full text-[10px] font-bold border border-gold/20">
                                 {e.name}: +${e.price.toFixed(2)}
                               </div>
                             ))}
                           </div>
                        </div>
                      )}

                      {analysisError ? (
                         <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 items-start">
                            <Info className="text-red-400 shrink-0 mt-1" size={16} />
                            <p className="text-[11px] text-red-200/60 leading-relaxed italic">{analysisError}</p>
                         </div>
                      ) : (
                        <button 
                          onClick={() => {
                            setOrder(p => ({ ...p, isAiAnalysisAccepted: true }));
                            setStep('CHECKOUT');
                          }}
                          className="w-full mt-10 py-5 bg-gold text-petroleo font-black rounded-full text-[10px] tracking-[0.4em] uppercase shadow-2xl active:scale-95 transition-all"
                        >
                          CONFIRMAR Y CONTINUAR
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {step === 'CHECKOUT' && (
          <motion.div 
            key="checkout"
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="p-8 pt-32 min-h-screen pb-48 z-10 relative"
          >
            <h2 className="text-gold uppercase tracking-[0.4em] text-[10px] font-black mb-2 italic">Paso Final</h2>
            <h3 className="font-serif text-4xl mb-12 italic">Datos de Entrega</h3>
            
            <div className="space-y-10">
              <div className="group border-b border-white/5 focus-within:border-gold transition-all duration-500 pb-3">
                <label className="block text-[9px] uppercase font-black tracking-[0.4em] text-white/30 mb-3 italic">Titular del Pedido</label>
                <input 
                  type="text" 
                  value={order.clientName}
                  onChange={e => setOrder({...order, clientName: e.target.value})}
                  className="w-full bg-transparent text-2xl font-serif italic outline-none placeholder:text-white/5 text-gold"
                  placeholder="Ej. Camila Muñoz..."
                />
              </div>

              <div className="grid grid-cols-2 gap-10">
                <div className="group border-b border-white/5 focus-within:border-gold transition-all duration-500 pb-3">
                  <label className="block text-[9px] uppercase font-black tracking-[0.4em] text-white/30 mb-3 italic">Fecha Deseada</label>
                  <div className="flex items-center gap-3">
                    <Calendar className="text-gold/50" size={16} />
                    <input 
                      type="date" 
                      value={order.deliveryDate}
                      onChange={e => setOrder({...order, deliveryDate: e.target.value})}
                      className="bg-transparent outline-none flex-1 font-black text-xs placeholder:text-white/10 uppercase tracking-widest text-white"
                    />
                  </div>
                </div>
                <div className="group border-b border-white/5 focus-within:border-gold transition-all duration-500 pb-3">
                  <label className="block text-[9px] uppercase font-black tracking-[0.4em] text-white/30 mb-3 italic">Momento</label>
                  <div className="flex items-center gap-3">
                    <Clock className="text-gold/50" size={16} />
                    <select 
                      value={order.deliveryTime}
                      onChange={e => setOrder({...order, deliveryTime: e.target.value})}
                      className="bg-transparent outline-none flex-1 font-black text-xs appearance-none uppercase tracking-widest text-white"
                    >
                      {["09:00", "11:00", "13:00", "15:00", "17:00"].map(t => <option key={t} value={t} className="bg-petroleo">{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-gold/5 rounded-[3rem] border border-gold/10 flex gap-6 mt-16 backdrop-blur-md mb-12">
                <Info className="text-gold shrink-0 mt-1" size={20} />
                <p className="text-xs text-white/50 leading-[1.8] italic font-light">
                  Apreciamos tu elección. Tu pedido se agendará formalmente tras verificar el abono del <strong className="text-gold">50% del total</strong> ($${(calculateTotal()/2).toFixed(2)}). Recibirás los datos bancarios al confirmar.
                </p>
              </div>

              <button 
                onClick={() => {
                  if (order.clientName && order.deliveryDate) {
                    setStep('SUCCESS');
                  } else {
                    alert("Por favor completa los datos de entrega.");
                  }
                }}
                disabled={!order.clientName || !order.deliveryDate || !order.deliveryTime}
                className="w-full py-6 bg-gold text-petroleo font-black rounded-3xl text-xs tracking-[0.3em] uppercase shadow-[0_0_50px_rgba(197,160,89,0.3)] disabled:opacity-20 active:scale-95 transition-all"
              >
                CONFIRMAR PEDIDO
              </button>
            </div>
          </motion.div>
        )}

        {step === 'SUCCESS' && (
          <motion.div 
            key="success"
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-screen text-center p-8 z-10 relative"
          >
            <div className="w-28 h-28 bg-gold rounded-full flex items-center justify-center mb-10 shadow-[0_0_100px_rgba(197,160,89,0.4)]">
              <Check size={48} className="text-petroleo" strokeWidth={4} />
            </div>
            <h3 className="font-serif text-5xl mb-6 italic text-gold">¡Dulzura Registrada!</h3>
            
            {/* TICKET DE PEDIDO */}
            <div className="bg-white text-petroleo p-8 rounded-3xl w-full max-w-sm mb-10 shadow-2xl relative overflow-hidden font-sans text-left">
              {/* Serrated Edges Effect */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-[radial-gradient(circle_at_center,_#122a32_3px,_transparent_3.5px)] bg-[length:12px_12px] bg-repeat-x opacity-10" />
              
              <div className="text-center mb-6 pt-4">
                <span className="text-[10px] font-black tracking-[0.3em] uppercase opacity-40">Resumen del Pedido</span>
                <h4 className="font-serif italic text-2xl mt-1">Pan & Canela</h4>
              </div>

              <div className="space-y-4 border-y border-petroleo/10 py-6 my-6 border-dashed">
                <div className="flex justify-between text-[10px] uppercase font-black tracking-widest opacity-40">
                  <span>Detalle</span>
                  <span>Valor</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold flex-1">{order.size?.name} ({order.size?.shape})</span>
                  </div>
                  
                  {/* Piso Base */}
                  <div className="pl-2 border-l-2 border-gold/30">
                    <p className="text-[10px] font-bold text-gold uppercase tracking-tighter">
                      {order.size?.isDouble ? 'Piso Abajo' : 'Bizcocho'}
                    </p>
                    <p className="text-[11px] font-medium opacity-80">{order.baseFlavor?.name}</p>
                    <p className="text-[10px] italic opacity-50">
                      Rellenos: {
                        (() => {
                          const counts: { [key: string]: number } = {};
                          order.baseFillings.forEach(f => counts[f.name] = (counts[f.name] || 0) + 1);
                          return Object.entries(counts).map(([name, count]) => count > 1 ? `${count}x ${name}` : name).join(', ');
                        })()
                      }
                    </p>
                  </div>

                  {/* Piso Cima (si es doble) */}
                  {order.size?.isDouble && (
                    <div className="pl-2 border-l-2 border-gold/30">
                      <p className="text-[10px] font-bold text-gold uppercase tracking-tighter">Piso Arriba</p>
                      <p className="text-[11px] font-medium opacity-80">{order.topFlavor?.name}</p>
                      <p className="text-[10px] italic opacity-50">
                        Rellenos: {
                          (() => {
                            const counts: { [key: string]: number } = {};
                            order.topFillings.forEach(f => counts[f.name] = (counts[f.name] || 0) + 1);
                            return Object.entries(counts).map(([name, count]) => count > 1 ? `${count}x ${name}` : name).join(', ');
                          })()
                        }
                      </p>
                    </div>
                  )}

                  {/* Extras detectados por IA */}
                  {order.isAiAnalysisAccepted && order.aiDetectedExtras.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[10px] font-bold uppercase text-gold/60 tracking-tighter">Detalles de Diseño (IA)</p>
                      <p className="text-[10px] font-medium italic opacity-70">
                        {order.aiDetectedExtras.map(e => e.name).join(', ')}
                      </p>
                    </div>
                  )}

                  {/* Extras */}
                  {order.selectedExtras.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[10px] font-bold uppercase opacity-30 tracking-tighter">Extras</p>
                      <p className="text-[10px] font-medium italic opacity-70">
                        {order.selectedExtras.map(e => e.name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 space-y-2 border-t border-petroleo/5">
                  <div className="flex justify-between text-[11px]">
                    <span className="opacity-50">Cliente:</span>
                    <span className="font-bold">{order.clientName}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="opacity-50">Entrega:</span>
                    <span className="font-bold">{order.deliveryDate} @ {order.deliveryTime}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs opacity-50 font-medium">Inversión Total:</span>
                  <span className="text-2xl font-black italic">${calculateTotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-gold/10 p-4 rounded-2xl border border-gold/20">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gold/60">Reserva (50%)</span>
                    <span className="text-[10px] opacity-40 tracking-tighter italic">Para confirmar fecha</span>
                  </div>
                  <span className="text-lg font-black text-gold">${(calculateTotal() / 2).toFixed(2)}</span>
                </div>
              </div>

              {/* Bottom Serrated Edge */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[radial-gradient(circle_at_center,_#122a32_3px,_transparent_3.5px)] bg-[length:12px_12px] bg-repeat-x opacity-10" />
            </div>

            <p className="text-white/40 font-light mb-10 max-w-xs leading-relaxed italic text-sm">
              Haz clic abajo para enviarnos tu detalle por WhatsApp y registrar oficialmente el pedido.
            </p>
            
            <button 
              onClick={finalizeOrder}
              disabled={isFinishing}
              className="flex items-center gap-4 px-10 py-6 bg-gold text-petroleo font-black rounded-full text-xs tracking-[0.3em] uppercase mb-12 shadow-[0_0_50px_rgba(197,160,89,0.3)] active:scale-95 transition-all disabled:opacity-50"
            >
              {isFinishing ? 'PROCESANDO...' : 'CONFIRMAR EN WHATSAPP'} 
              {!isFinishing && <Smartphone size={18} strokeWidth={3} />}
            </button>

            <button 
              onClick={() => window.location.reload()}
              className="text-white/20 font-bold tracking-[0.3em] uppercase text-[9px] border-b border-white/5 pb-2 hover:text-gold hover:border-gold transition-all"
            >
              NUEVO PEDIDO
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- OVERLAY PARA RELLENOS Y EXTRAS --- */}
      <AnimatePresence>
        {activeOverlay && (
          <motion.div 
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 z-[60] h-[88vh] glass-morphism-dark rounded-t-[4rem] p-8 pb-16 overflow-y-auto"
          >
             <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/10 rounded-full" />
            
             <div className="flex justify-between items-center mb-12 sticky top-0 bg-transparent pt-4 z-10">
              <div className="max-w-[80%]">
                <h4 className="text-gold uppercase tracking-[0.5em] text-[9px] font-black pb-2 italic">
                  {activeOverlay === 'EXTRAS' ? 'COMPLEMENTOS' : `SABOR: ${activeOverlay === 'TOP' ? order.topFlavor?.name : order.baseFlavor?.name}`}
                </h4>
                <p className="font-serif text-3xl italic tracking-tight">
                  {activeOverlay === 'EXTRAS' ? 'Extras Gourmet' : 'Rellenos del Piso'}
                </p>
              </div>
              <button 
                onClick={() => setActiveOverlay(null)} 
                className="p-4 bg-white/5 rounded-full text-white/30 hover:text-white transition-all border border-white/5 shadow-2xl active:scale-95"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {activeOverlay === 'EXTRAS' ? (
                Array.isArray(sheetsData?.Extras) ? sheetsData.Extras.map((e: any) => {
                  const isSelected = order.selectedExtras.some(ex => ex.name === e.Producto);
                  return (
                    <button
                      key={e.Producto}
                      onClick={() => {
                        if (isSelected) {
                          setOrder({...order, selectedExtras: order.selectedExtras.filter(ex => ex.name !== e.Producto)});
                        } else if (order.selectedExtras.length < 3) {
                          setOrder({...order, selectedExtras: [...order.selectedExtras, { name: e.Producto, price: e.Precio }]});
                        }
                      }}
                      className={`w-full flex items-center gap-5 p-5 rounded-[2rem] transition-all border group ${isSelected ? 'bg-gold text-petroleo border-gold' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-lg'}`}
                    >
                      <img src={getImageUrl(e.Producto)} className="w-20 h-20 rounded-3xl object-cover shadow-2xl" alt={e.Producto} />
                      <div className="flex-1 text-left">
                        <p className="font-black text-sm tracking-tight mb-1">{e.Producto}</p>
                        <p className={`font-black text-xs italic ${isSelected ? 'text-petroleo/70' : 'text-gold'}`}>+${e.Precio.toFixed(2)}</p>
                      </div>
                      {isSelected && <div className="p-2 bg-petroleo text-gold rounded-full"><Check size={16} strokeWidth={4} /></div>}
                    </button>
                  );
                }) : (
                  <div className="p-10 text-center opacity-30 italic text-xs">No hay extras disponibles</div>
                )
              ) : (
                <>
                  <p className="text-white/20 text-[9px] uppercase font-black tracking-[0.4em] mb-8 italic">Selecciona hasta 2 rellenos artesanales por piso:</p>
                  <div className="grid gap-3">
                    {Array.isArray(sheetsData?.Rellenos) ? sheetsData.Rellenos.map((f: any) => {
                      const list = activeOverlay === 'BASE' ? order.baseFillings : order.topFillings;
                      const count = list.filter(item => item.name === f.Relleno).length;
                      const totalSelected = list.length;
                      
                      const addFilling = () => {
                        if (totalSelected < 2) {
                          const newList = [...list, { name: f.Relleno, price: f.Precio }];
                          setOrder({ ...order, [activeOverlay === 'BASE' ? 'baseFillings' : 'topFillings']: newList });
                        }
                      };

                      const removeFilling = () => {
                        const idx = list.findLastIndex(item => item.name === f.Relleno);
                        if (idx > -1) {
                          const newList = [...list];
                          newList.splice(idx, 1);
                          setOrder({ ...order, [activeOverlay === 'BASE' ? 'baseFillings' : 'topFillings']: newList });
                        }
                      };

                      return (
                        <div
                          key={f.Relleno}
                          className={`w-full flex items-center justify-between p-6 rounded-[2rem] transition-all border ${count > 0 ? 'bg-gold/10 border-gold/50' : 'bg-white/5 border-white/5'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full transition-all ${count > 0 ? 'bg-gold scale-150' : 'bg-white/20'}`} />
                            <div className="flex flex-col">
                              <span className="font-black uppercase tracking-[0.2em] text-[11px] italic">{f.Relleno}</span>
                              <span className="text-[9px] opacity-40 italic">
                                {f.Precio > 0 ? `+$${f.Precio.toFixed(2)}` : 'Incluido'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 bg-petroleo/40 rounded-2xl p-1 border border-white/5">
                            <button 
                              onClick={removeFilling}
                              className={`p-2 rounded-xl transition-all ${count > 0 ? 'text-gold hover:bg-gold/20' : 'text-white/5 cursor-not-allowed'}`}
                              disabled={count === 0}
                            >
                              <Minus size={16} strokeWidth={3} />
                            </button>
                            <span className={`w-6 text-center font-black text-sm italic transition-all ${count > 0 ? 'text-gold scale-125' : 'text-white/5'}`}>
                              {count > 0 ? count : '·'}
                            </span>
                            <button 
                              onClick={addFilling}
                              className={`p-2 rounded-xl transition-all ${totalSelected < 2 ? 'text-gold hover:bg-gold/20' : 'text-white/5 cursor-not-allowed'}`}
                              disabled={totalSelected >= 2}
                            >
                              <Plus size={16} strokeWidth={3} />
                            </button>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="p-10 text-center opacity-30 italic text-xs">No hay rellenos disponibles</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={() => setActiveOverlay(null)}
              className="w-full mt-16 py-6 bg-white text-petroleo font-black rounded-3xl flex items-center justify-center gap-3 tracking-[0.4em] uppercase text-[10px] shadow-2xl active:scale-95 transition-all outline-none"
            >
              REALIZADO <Check size={16} strokeWidth={4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- STICKY FOOTER NAVIGATION --- */}
      {step !== 'WELCOME' && step !== 'SUCCESS' && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-10 left-8 right-8 z-[55] pointer-events-none"
        >
          <div className="bg-petroleo/80 backdrop-blur-3xl border border-white/10 p-5 rounded-[3rem] flex items-center justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto">
            <div className="flex flex-col pl-4">
              <span className="text-[10px] text-white/30 uppercase font-black tracking-[0.4em] italic mb-1">Inversion</span>
              <span className="text-gold font-serif text-3xl italic tracking-tight">${calculateTotal().toFixed(2)}</span>
            </div>
            
            {step === 'FLAVORS' ? (
              <button 
                onClick={() => setStep('DESIGN_ANALYSIS')}
                disabled={!isConfigValid()}
                className={`flex items-center gap-3 py-4 px-10 rounded-full font-black text-[10px] tracking-[0.4em] uppercase transition-all duration-500 shadow-2xl ${
                  isConfigValid() ? 'bg-gold text-petroleo scale-105 active:scale-90' : 'bg-white/5 text-white/10 cursor-not-allowed'
                }`}
              >
                {isConfigValid() ? <>LISTO <ArrowRight size={14} strokeWidth={4} /></> : 'RELLENOS...'}
              </button>
            ) : (
              <button 
                onClick={step === 'SIZE' ? () => {} : step === 'DESIGN_ANALYSIS' ? () => setStep('CHECKOUT') : () => {
                  if (order.clientName && order.deliveryDate) {
                    setStep('SUCCESS');
                  } else if (step === 'CHECKOUT') {
                    alert("Por favor completa los datos de entrega.");
                  }
                }}
                disabled={step === 'CHECKOUT' && (!order.clientName || !order.deliveryDate)}
                className={`flex items-center gap-3 py-4 px-10 rounded-full font-black text-[10px] tracking-[0.4em] uppercase transition-all duration-500 shadow-2xl ${
                  (step === 'SIZE' || step === 'DESIGN_ANALYSIS' || (order.clientName && order.deliveryDate)) ? 'bg-gold text-petroleo scale-105 active:scale-90 shadow-gold/20' : 'bg-white/5 text-white/10'
                }`}
              >
                {step === 'SIZE' ? 'PASO 02' : step === 'DESIGN_ANALYSIS' ? 'PASAR' : <>PEDIR <Smartphone size={14} strokeWidth={4} /></>}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Back Button for non-welcome steps */}
      {step !== 'WELCOME' && step !== 'SUCCESS' && (
        <button 
           onClick={() => setStep(
             step === 'SIZE' ? 'WELCOME' : 
             step === 'FLAVORS' ? 'SIZE' : 
             step === 'DESIGN_ANALYSIS' ? 'FLAVORS' : 
             'DESIGN_ANALYSIS'
           )}
           className="fixed top-8 left-8 z-[60] p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-gold shadow-2xl active:scale-90 transition-all"
        >
            <ChevronLeft size={20} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
