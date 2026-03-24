import React, { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, Key, AlertTriangle, CheckCircle, XCircle, ArrowRight, ArrowLeft, User, CheckSquare, Trash2, Cpu, Flame, Code, Camera, RefreshCw } from 'lucide-react';
export default function EscapeRoomBlazor() {
  const [stage, setStage] = useState('intro'); // intro, stage1, stage2, stage3, unlocking, escaped
  const [message, setMessage] = useState({ text: '', type: '', isClosing: false });
  const [isStarting, setIsStarting] = useState(false); // מצב טעינה במסך הפתיחה

  const autoCloseTimeoutRef = useRef(null);
  const animationTimeoutRef = useRef(null);
  // Photo Booth Refs & State
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const renderLoopRef = useRef(null);
  const isTakingPhotoRef = useRef(false);

  const targetFaceRef = useRef(null);
  const smoothedFaceRef = useRef(null);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [cameraError, setCameraError] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stage]);
  const handleStartGame = () => {
    setStage('stage1');
  };
  // טעינת מצלמה + שילוב MediaPipe בזהירות בסיום
  useEffect(() => {
    let isActive = true;
    let faceDetector = null;
    let selfieSegmentation = null;
    let segMask = null;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 800;
    offCanvas.height = 600;
    const offCtx = offCanvas.getContext('2d');
    const bgImage = new Image();
    bgImage.src = import.meta.env.BASE_URL + 'bg.jpg';
    const initCamera = async () => {
      try {
        setCameraError(false);
        setIsModelLoaded(false);
        setModelFailed(false);

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!isActive) return;
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // ניסיון לטעון מודל Face Detection של גוגל MediaPipe
        try {
          const fallbackTimer = setTimeout(() => {
            if (isActive && !isModelLoaded) {
              console.warn("MediaPipe model loading timed out. Falling back to static photo booth.");
              setModelFailed(true);
            }
          }, 8000);
          if (!window.FaceDetection) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/face_detection.js';
              script.crossOrigin = 'anonymous';
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          if (!window.SelfieSegmentation) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
              script.crossOrigin = 'anonymous';
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          }
          if (isActive && window.FaceDetection) {
            faceDetector = new window.FaceDetection({
              locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
            });
            faceDetector.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
            faceDetector.onResults((results) => {
              if (!isActive) return;
              targetFaceRef.current = results.detections?.length > 0 ? results.detections[0] : null;
            });
            await faceDetector.initialize();
          }
          if (isActive && window.SelfieSegmentation) {
            selfieSegmentation = new window.SelfieSegmentation({
              locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
            });
            selfieSegmentation.setOptions({ modelSelection: 1 });
            selfieSegmentation.onResults((results) => {
              if (!isActive) return;
              segMask = results.segmentationMask;
            });
            await selfieSegmentation.initialize();
          }
          clearTimeout(fallbackTimer);
          if (isActive) setIsModelLoaded(true);
          const processVideo = async () => {
            if (!isActive) return;
            if (videoRef.current && videoRef.current.readyState >= 2) {
              try {
                await faceDetector?.send({ image: videoRef.current });
                await selfieSegmentation?.send({ image: videoRef.current });
              } catch(e){}
            }
            requestAnimationFrame(processVideo);
          };
          processVideo();
        } catch (aiError) {
          console.warn("MediaPipe model blocked/failed, falling back to static photo booth.", aiError);
          if (isActive) setModelFailed(true);
        }
        // לולאת רינדור לוידאו ואפקטים
        const renderLoop = () => {
          if (!isActive) return;

          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas) {
            renderLoopRef.current = requestAnimationFrame(renderLoop);
            return;
          }

          const ctx = canvas.getContext('2d');
          const cw = canvas.width;
          const ch = canvas.height;
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          if (vw === 0 || vh === 0) {
            renderLoopRef.current = requestAnimationFrame(renderLoop);
            return;
          }
          ctx.clearRect(0, 0, cw, ch);
          const scale = Math.max(cw / vw, ch / vh);
          const offsetX = (cw / 2) - (vw / 2) * scale;
          const offsetY = (ch / 2) - (vh / 2) * scale;

          if (segMask) {
            // גישה רשמית של MediaPipe להחלפת רקע (source-in / destination-atop)
            // 1. ציור מסכת ה-segmentation המוראה — alpha: אדם=255, רקע=0
            ctx.save();
            ctx.translate(cw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(segMask, offsetX, offsetY, vw * scale, vh * scale);
            ctx.restore();
            // 2. source-in: ציור הוידאו רק על פיקסלים שבהם המסכה אטומה (האדם)
            ctx.globalCompositeOperation = 'source-in';
            ctx.save();
            ctx.translate(cw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, offsetX, offsetY, vw * scale, vh * scale);
            ctx.restore();
            // 3. destination-atop: ציור הרקע בכל מקום שאין אדם
            ctx.globalCompositeOperation = 'destination-atop';
            if (bgImage.complete && bgImage.naturalWidth > 0) {
              ctx.drawImage(bgImage, 0, 0, cw, ch);
            } else {
              ctx.fillStyle = '#0a080d';
              ctx.fillRect(0, 0, cw, ch);
            }
            ctx.globalCompositeOperation = 'source-over';
          } else {
            // גיבוי: ציור הוידאו עם פילטר סגול כהה
            ctx.save();
            ctx.translate(cw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, offsetX, offsetY, vw * scale, vh * scale);
            ctx.restore();
            ctx.fillStyle = 'rgba(25, 5, 45, 0.5)';
            ctx.fillRect(0, 0, cw, ch);
            const gradient = ctx.createRadialGradient(cw/2, ch/2, ch/5, cw/2, ch/2, ch);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(1, 'rgba(5, 3, 15, 0.95)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, cw, ch);
          }
          const cx = cw / 2;
          const cy = ch / 2 - 20;
          // ציור האביזרים לפי MediaPipe (אם יש זיהוי פנים)
          if (targetFaceRef.current && isModelLoaded && !modelFailed) {
            const detection = targetFaceRef.current;
            const rightEyeRaw = detection.landmarks[0];
            const leftEyeRaw = detection.landmarks[1];
            const mapCoord = (normX, normY) => {
              const vidX = normX * vw;
              const vidY = normY * vh;
              const scaledX = vidX * scale + offsetX;
              const scaledY = vidY * scale + offsetY;
              return { x: cw - scaledX, y: scaledY };
            };
            const tRight = mapCoord(rightEyeRaw.x, rightEyeRaw.y);
            const tLeft = mapCoord(leftEyeRaw.x, leftEyeRaw.y);
            if (!smoothedFaceRef.current) {
              smoothedFaceRef.current = { right: tRight, left: tLeft };
            } else {
              const alpha = 0.3;
              smoothedFaceRef.current.right.x += (tRight.x - smoothedFaceRef.current.right.x) * alpha;
              smoothedFaceRef.current.right.y += (tRight.y - smoothedFaceRef.current.right.y) * alpha;
              smoothedFaceRef.current.left.x += (tLeft.x - smoothedFaceRef.current.left.x) * alpha;
              smoothedFaceRef.current.left.y += (tLeft.y - smoothedFaceRef.current.left.y) * alpha;
            }
            const sRight = smoothedFaceRef.current.right;
            const sLeft = smoothedFaceRef.current.left;
            const dx = sRight.x - sLeft.x;
            const dy = sRight.y - sLeft.y;
            const angle = Math.atan2(dy, dx);
            const dist = Math.sqrt(dx * dx + dy * dy);

            const faceCenterX = (sRight.x + sLeft.x) / 2;
            const faceCenterY = (sRight.y + sLeft.y) / 2;
            ctx.save();
            ctx.translate(faceCenterX, faceCenterY);
            ctx.rotate(angle);
            // --- א. ציור כובע בלשים שחור (פדורה) ---
            const hatWidth = dist * 3.5;
            const hatHeight = dist * 1.8;
            const hatYOffset = -dist * 1.6;
            ctx.fillStyle = '#111111';
            ctx.beginPath();
            ctx.ellipse(0, hatYOffset, hatWidth / 2, dist * 0.35, 0, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.moveTo(-hatWidth * 0.35, hatYOffset);
            ctx.lineTo(-hatWidth * 0.3, hatYOffset - hatHeight * 0.8);
            ctx.quadraticCurveTo(0, hatYOffset - hatHeight, hatWidth * 0.3, hatYOffset - hatHeight * 0.8);
            ctx.lineTo(hatWidth * 0.35, hatYOffset);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#2d1b4e';
            ctx.beginPath();
            ctx.moveTo(-hatWidth * 0.34, hatYOffset - dist * 0.1);
            ctx.lineTo(-hatWidth * 0.32, hatYOffset - dist * 0.4);
            ctx.lineTo(hatWidth * 0.32, hatYOffset - dist * 0.4);
            ctx.lineTo(hatWidth * 0.34, hatYOffset - dist * 0.1);
            ctx.closePath();
            ctx.fill();
            // --- ב. ציור זכוכית מגדלת ריאליסטית ---
            const eyeOffsetX = dist / 2;
            const eyeOffsetY = 0;
            const magRadius = dist * 0.7;
            ctx.translate(eyeOffsetX, eyeOffsetY);
            ctx.lineWidth = magRadius * 0.35;
            ctx.strokeStyle = '#4a2e15';
            ctx.beginPath();
            ctx.moveTo(magRadius * 0.7, magRadius * 0.7);
            ctx.lineTo(magRadius * 2.5, magRadius * 2.5);
            ctx.stroke();
            ctx.lineWidth = magRadius * 0.15;
            ctx.strokeStyle = '#111';
            ctx.beginPath();
            ctx.arc(0, 0, magRadius, 0, Math.PI * 2);
            ctx.stroke();
            const glassGradient2 = ctx.createRadialGradient(0, 0, 2, 0, 0, magRadius);
            glassGradient2.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
            glassGradient2.addColorStop(1, 'rgba(150, 220, 255, 0.25)');
            ctx.fillStyle = glassGradient2;
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(-magRadius*0.3, -magRadius*0.3, magRadius*0.2, magRadius*0.1, Math.PI / 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fill();
            ctx.restore();
          } else {
            // --- תצוגת גיבוי כשה-AI לא טעון ---
            if (!isTakingPhotoRef.current && !photoDataUrl) {
               ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
               ctx.lineWidth = 3;
               ctx.setLineDash([15, 15]);
               ctx.beginPath();
               ctx.ellipse(cx, cy + 20, 100, 140, 0, 0, Math.PI * 2);
               ctx.stroke();
               ctx.setLineDash([]);
               ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
               ctx.font = 'bold 22px Arial, sans-serif';
               ctx.textAlign = 'center';
               if (!isModelLoaded && !modelFailed) {
                 ctx.fillText('טוען קסם זיהוי פנים...', cx, cy + 200);
               } else {
                 ctx.fillText('מקמו את הפנים באליפסה', cx, cy + 200);
               }
            }
            // הכובע הסטטי מוצג רק כשהמודל נכשל לחלוטין — לא בזמן הטעינה
            if (modelFailed) {
              const hatYOffset = cy - 140;
              ctx.save();
              ctx.translate(cx, hatYOffset);
              ctx.fillStyle = '#111111';
              ctx.beginPath();
              ctx.ellipse(0, 30, 140, 25, 0, 0, 2 * Math.PI);
              ctx.fill();
              ctx.fillStyle = '#1a1a1a';
              ctx.beginPath();
              ctx.moveTo(-80, 30);
              ctx.lineTo(-70, -45);
              ctx.quadraticCurveTo(0, -65, 70, -45);
              ctx.lineTo(80, 30);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#2d1b4e';
              ctx.beginPath();
              ctx.moveTo(-78, 25);
              ctx.lineTo(-75, 5);
              ctx.lineTo(75, 5);
              ctx.lineTo(78, 25);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
              const eyeX = cx + 45;
              const eyeY = cy - 30;
              const magRadius = 38;
              ctx.save();
              ctx.translate(eyeX, eyeY);
              ctx.lineWidth = 14;
              ctx.strokeStyle = '#4a2e15';
              ctx.beginPath();
              ctx.moveTo(magRadius * 0.7, magRadius * 0.7);
              ctx.lineTo(magRadius * 2.8, magRadius * 2.8);
              ctx.stroke();
              ctx.lineWidth = 7;
              ctx.strokeStyle = '#111';
              ctx.beginPath();
              ctx.arc(0, 0, magRadius, 0, Math.PI * 2);
              ctx.stroke();
              const glassGradient2 = ctx.createRadialGradient(0, 0, 5, 0, 0, magRadius);
              glassGradient2.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
              glassGradient2.addColorStop(1, 'rgba(180, 220, 255, 0.35)');
              ctx.fillStyle = glassGradient2;
              ctx.fill();
              ctx.beginPath();
              ctx.ellipse(-12, -12, 14, 6, Math.PI / 4, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.4)';
              ctx.fill();
              ctx.restore();
            }
          }
          // מסגרות קישוט חדר בריחה
          const borderWidth = 30;
          ctx.strokeStyle = '#9333ea';
          ctx.lineWidth = 6;
          ctx.strokeRect(borderWidth, borderWidth, cw - borderWidth * 2, ch - 110 - borderWidth);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(borderWidth + 6, borderWidth + 6, cw - borderWidth * 2 - 12, ch - 110 - borderWidth - 12);
          ctx.font = '45px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🗝️', borderWidth, borderWidth);
          ctx.fillText('🔒', cw - borderWidth, borderWidth);
          ctx.fillText('💻', borderWidth, ch - 110);
          ctx.fillText('🔥', cw - borderWidth, ch - 110);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(0, ch - 110, cw, 110);
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 36px Arial, sans-serif';
          ctx.shadowColor = '#9333ea';
          ctx.shadowBlur = 15;
          ctx.fillText('יצאתי בהצלחה ממרתף השרתים!', cw / 2, ch - 45);
          ctx.shadowBlur = 0;
          if (!photoDataUrl && isActive) {
            renderLoopRef.current = requestAnimationFrame(renderLoop);
          }
        };
        renderLoop();
      } catch (err) {
        console.error("Camera error:", err);
        if (isActive) setCameraError(true);
      }
    };
    if (stage === 'escaped' && !photoDataUrl) {
      initCamera();
    }
    return () => {
      isActive = false;
      if (faceDetector) { try { faceDetector.close(); } catch(e){} }
      if (selfieSegmentation) { try { selfieSegmentation.close(); } catch(e){} }
      if (renderLoopRef.current) cancelAnimationFrame(renderLoopRef.current);
      stopCamera();
    };
  }, [stage, photoDataUrl]);
  const takePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isTakingPhotoRef.current = true;
    setTimeout(() => {
      setPhotoDataUrl(canvas.toDataURL('image/png'));
      isTakingPhotoRef.current = false;
      stopCamera();
    }, 50);
  };
  const retakePhoto = () => {
    setPhotoDataUrl(null);
  };
  const restartGame = () => {
    setStage('intro');
    setFoundComponents([]);
    setCipherInput('');
    setCards(initialCards);
    setSelectedWords3a([]);
    setSelectedWords3b([]);
    setStage3Phase(1);
    setShowCode(false);
    setPhotoDataUrl(null);
  };
  // --- Stage 1 State ---
  const [foundComponents, setFoundComponents] = useState([]);
  const [cipherInput, setCipherInput] = useState('');

  // --- Stage 2 State ---
  const initialCards = [
    { id: 1, name: 'TaskTitle', type: 'string', desc: 'הטקסט שיוצג עבור המשימה', target: 'task', bucket: 'pool' },
    { id: 2, name: 'DbConnectionString', type: 'string', desc: 'מחרוזת התחברות לשרת ה-SQL', target: 'trash', bucket: 'pool' },
    { id: 3, name: 'IsSidebarOpen', type: 'bool', desc: 'האם התפריט הצדדי פתוח כרגע?', target: 'trash', bucket: 'pool' },
    { id: 4, name: 'UserName', type: 'string', desc: 'שם להצגה', target: 'profile', bucket: 'pool' },
    { id: 5, name: 'IsCompleted', type: 'bool', desc: 'האם המשימה כבר בוצעה?', target: 'task', bucket: 'pool' },
    { id: 6, name: 'ButtonColor', type: 'string', desc: 'צבע הרקע של כפתור כללי במערכת', target: 'trash', bucket: 'pool' },
    { id: 7, name: 'UserRole', type: 'string', desc: 'תפקיד המשתמש', target: 'profile', bucket: 'pool' },
    { id: 8, name: 'TaskId', type: 'int', desc: 'מזהה ייחודי של המשימה', target: 'task', bucket: 'pool' },
  ];
  const [fireBurst, setFireBurst] = useState(false);
  const [dragOverBucket, setDragOverBucket] = useState(null);
  const [cards, setCards] = useState(initialCards);
  // --- Stage 3 States ---
  const [stage3Phase, setStage3Phase] = useState(1);
  const [selectedWords3a, setSelectedWords3a] = useState([]);
  const [selectedWords3b, setSelectedWords3b] = useState([]);
  const [showCode, setShowCode] = useState(false);

  const stage3aWords = ['EventCallback', '{ get; set; }', '[Parameter]', 'string', 'EventCallback<int>', 'Action', 'public', 'InvokeAsync()', 'OnTaskCompleted'];
  const correctSequence3a = ['[Parameter]', 'public', 'EventCallback<int>', 'OnTaskCompleted', '{ get; set; }'];
  const stage3bWords = ['.InvokeAsync(', 'await', 'Trigger(', 'TaskId', 'int', 'OnTaskCompleted', 'Action.Invoke()', 'Send(', ');'];
  const correctSequence3b = ['await', 'OnTaskCompleted', '.InvokeAsync(', 'TaskId', ');'];
  const showMessage = (text, type = 'error') => {
    if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    setMessage({ text, type, isClosing: false });
    autoCloseTimeoutRef.current = setTimeout(() => {
      closeMessage();
    }, 5000);
  };
  const closeMessage = () => {
    if (autoCloseTimeoutRef.current) clearTimeout(autoCloseTimeoutRef.current);
    setMessage(prev => ({ ...prev, isClosing: true }));
    if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    animationTimeoutRef.current = setTimeout(() => {
      setMessage({ text: '', type: '', isClosing: false });
    }, 600);
  };
  const handleComponentClick = (id, emoji) => {
    if (!foundComponents.find(c => c.id === id)) {
      setFoundComponents([...foundComponents, { id, emoji }]);
      if (id === 'notif') showMessage('כל הכבוד! זוהי בחירה טובה בקומפוננטה כיוון שבכל מקום בו נרצה להציג פריט ברשימה עם מספר לידו נוכל להשתמש בקומפוננטה זו.', 'success');
      else if (id === 'task') showMessage("כל הכבוד! זהו רכיב שמתבקש להפוך לקומפוננטה - יש לו גם פונקציונליות וגם תוכן שמשתנה ממופע למופע.", 'success');
      else if (id === 'profile') showMessage('כל הכבוד! רכיב זה בהחלט יכול להיות קומפוננטה ולשמש אותנו במגוון עמודים וממשקים כאשר בכל מופע יקבל את שם המשתמש המחובר.', 'success');
    }
  };
  const handleWrongElementClick = (e) => {
    e.stopPropagation();
    showMessage('כל אלמנט יכול להיות קומפוננטה, אך זה אלמנט מאוד פשוט שהפיכתו לקומפוננטה יכולה לסבך את הפיתוח במקום לייעל אותו.', 'error');
  };
  const checkCipher = () => {
    if (cipherInput === 'קוד') {
      setStage('stage2');
      showMessage('הקוד פוצח! השלב הבא פתוח.', 'success');
    } else showMessage('הקוד שגוי. יש לעיין במקרא שבתחתית המסך.', 'error');
  };
  const handleDragStart = (e, cardId) => e.dataTransfer.setData('cardId', cardId);
  const handleDragOver = (e, bucket) => { e.preventDefault(); if (dragOverBucket !== bucket) setDragOverBucket(bucket); };
  const handleDragLeave = () => setDragOverBucket(null);
  const handleDrop = (e, destination) => {
    e.preventDefault();
    setDragOverBucket(null);
    const cardId = parseInt(e.dataTransfer.getData('cardId'), 10);
    if (!isNaN(cardId)) moveCard(cardId, destination);
  };
  const moveCard = (cardId, destination) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, bucket: destination } : c));
    if (destination === 'trash') {
      setFireBurst(true);
      setTimeout(() => setFireBurst(false), 700);
    }
  };
  const checkSorting = () => {
    const isAllSorted = cards.every(c => c.bucket !== 'pool');
    if (!isAllSorted) return showMessage('יש למיין את כל מגילות המידע לפני הבדיקה.', 'error');
    const wrongCards = cards.filter(c => c.bucket !== c.target);
    if (wrongCards.length === 0) {
      setStage('stage3');
      showMessage('חלוקה מושלמת! כעת נותר לחווט את ערוצי התקשורת חזרה לעמוד הראשי.', 'success');
    } else {
      showMessage('יש מגילות (פרמטרים) שלא מוינו בצורה נכונה, יש לצקת את הנתונים מחדש להמשך', 'error');
      setCards(prev => prev.map(c => c.bucket !== c.target ? { ...c, bucket: 'pool' } : c));
    }
  };
  const handleWordClick3a = (word) => setSelectedWords3a([...selectedWords3a, word]);
  const removeWord3a = (index) => { const n = [...selectedWords3a]; n.splice(index, 1); setSelectedWords3a(n); };
  const handleWordClick3b = (word) => setSelectedWords3b([...selectedWords3b, word]);
  const removeWord3b = (index) => { const n = [...selectedWords3b]; n.splice(index, 1); setSelectedWords3b(n); };
  const checkSequence3a = () => {
    if (selectedWords3a.length !== correctSequence3a.length) return showMessage('הלחש אינו באורך הנכון.', 'error');
    if (correctSequence3a.every((val, index) => val === selectedWords3a[index])) {
      setStage3Phase(2);
      showMessage('מצוין! ההגדרה נכונה. כעת נפעיל זאת.', 'success');
    } else {
      if (selectedWords3a[0] !== '[Parameter]') showMessage('איך Blazor ידע שזה פרמטר? חסרה תגית הגדרה בהתחלה.', 'error');
      else if (selectedWords3a.includes('EventCallback') && !selectedWords3a.includes('EventCallback<int>')) showMessage('EventCallback רגיל לא מספיק. אנחנו חייבים להעביר החוצה את מזהה המשימה (int).', 'error');
      else showMessage('התחביר שגוי. כדאי לנסות שוב לסדר את המילים לפי המבנה התקני ב-C#.', 'error');
    }
  };
  const checkSequence3b = () => {
    if (selectedWords3b.length !== correctSequence3b.length) return showMessage('שורת הקוד לא באורך הנכון.', 'error');
    if (correctSequence3b.every((val, index) => val === selectedWords3b[index])) {
      setStage('unlocking');
      setTimeout(() => {
        setStage('escaped');
      }, 3000);
    } else {
      if (!selectedWords3b.includes('.InvokeAsync(')) showMessage('כדי להפעיל EventCallback ב-Blazor אנחנו חייבים להשתמש ב-InvokeAsync.', 'error');
      else if (!selectedWords3b.includes('await')) showMessage('InvokeAsync היא פעולה אסינכרונית. כדאי להמתין לה (await).', 'error');
      else showMessage('קרוב! אבל סדר הפקודות או התחביר לא מדוייק. כדאי לנסות שוב.', 'error');
    }
  };
  const renderMessage = () => {
    if (!message.text) return null;
    return (
      <div className={`fixed top-4 left-1/2 p-4 shadow-2xl z-50 flex items-center justify-between gap-4 border ${message.type === 'error' ? 'bg-red-950/90 border-red-500/50 text-red-200' : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'} min-w-[300px] max-w-2xl ${message.isClosing ? 'animate-smoke-out' : 'animate-smoke-in'}`}>
        <div className="flex items-center gap-3">
          {message.type === 'error' ? <AlertTriangle className="text-amber-500 shrink-0" /> : <Flame className="text-amber-500 shrink-0" />}
          <span className="font-bold text-lg leading-tight">{message.text}</span>
        </div>
        <button onClick={closeMessage} className="text-white/60 hover:text-white transition-colors shrink-0"><XCircle size={24} /></button>
      </div>
    );
  };
  const renderIntro = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8 animate-fade-in">
      <div className="relative">
        <div className="absolute inset-0 bg-purple-600/20 blur-3xl rounded-full"></div>
        <Lock size={120} className="text-amber-500 mb-4 drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] relative z-10" />
      </div>
      <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-orange-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
        מרתף השרתים הנעול
      </h1>
      <p className="text-xl text-stone-300 max-w-2xl leading-relaxed bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-purple-900/50 shadow-[0_0_40px_rgba(88,28,135,0.4)]">
        דלת המרתף העתיק של הטירה ננעלה! <span className="text-amber-400 font-bold">מנגנון הקסם דורש ידע ביישום קומפוננטות ב-Blazor כדי לפתוח את שער הברזל.</span><br/>
        יש למפות את החלל, לארגן נתונים נכנסים, ולרקום את לחש התקשורת החוצה.
      </p>
      <button onClick={handleStartGame} disabled={isStarting} className="px-10 py-5 bg-gradient-to-r from-purple-900 to-[#3b1c54] hover:from-purple-800 hover:to-[#4a2e7a] text-amber-50 font-bold rounded-xl text-2xl transition-all border border-purple-500/30 shadow-[0_0_30px_rgba(147,51,234,0.5)] hover:shadow-[0_0_40px_rgba(168,85,247,0.7)] flex items-center gap-3 disabled:opacity-80">
        {isStarting ? <RefreshCw className="animate-spin text-amber-400" /> : <Key className="text-amber-400" />}
        {isStarting ? 'טוען...' : 'תחילת ניסיון בריחה'}
      </button>
    </div>
  );
  const renderStage1 = () => (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="mb-8 flex justify-between items-end border-b border-purple-900/50 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-amber-400 flex items-center gap-3 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"><Flame size={28}/> שלב 1: התמצאות באפלה</h2>
          <p className="text-stone-400 mt-2 text-lg">מוצג לפניכם חזיון של המערכת. יש למצוא וללחוץ על 3 האלמנטים שהכי מתאים לפתח כקומפוננטות לשימוש חוזר.</p>
        </div>
      </div>
      <div className="relative bg-[#16121d] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] w-full max-w-4xl mx-auto border-2 border-[#2d1b4e] text-stone-300 select-none ring-1 ring-purple-900/30">
        <div className="bg-[#1f1338] text-amber-100 p-5 flex justify-between items-center cursor-default border-b border-[#3b2a5c]">
          <div onClick={handleWrongElementClick} className="font-bold text-2xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-purple-400 cursor-pointer hover:opacity-80 transition-opacity">TaskMaster</div>
          <div onClick={(e) => { e.stopPropagation(); handleComponentClick('profile', '🧑‍💻'); }} className={`flex items-center gap-3 px-4 py-1.5 rounded-full border border-transparent ${foundComponents.find(c => c.id === 'profile') ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'hover:border-purple-500 cursor-pointer bg-[#2d1b4e]'}`}>
            <div className="w-9 h-9 rounded-full bg-[#16121d] flex items-center justify-center text-amber-500 font-bold border border-purple-800">א.י</div>
            <span className="font-medium">אורח מתחבר</span>
            {foundComponents.find(c => c.id === 'profile') && <span className="absolute -mt-12 bg-black/80 text-3xl p-1.5 rounded-lg border border-purple-600 z-10 drop-shadow-2xl">🧑‍💻</span>}
          </div>
        </div>
        <div className="flex p-5 gap-8 h-[320px] cursor-default bg-gradient-to-b from-transparent to-black/30">
          <div className="w-1/4 space-y-5 border-l border-[#2d1b4e] pl-6">
            <h3 onClick={handleWrongElementClick} className="font-bold text-purple-400 text-sm uppercase tracking-widest cursor-pointer hover:text-purple-300">תפריט הלחשים</h3>
            <div onClick={(e) => { e.stopPropagation(); handleComponentClick('notif', '🔔'); }} className={`p-3.5 rounded-xl flex items-center justify-between border ${foundComponents.find(c => c.id === 'notif') ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'border-[#3b2a5c] bg-[#1f1338] hover:border-purple-400 cursor-pointer'}`}>
              <span className="text-sm font-medium text-stone-200">הודעות חדשות</span>
              <span className="bg-amber-600 text-stone-900 font-bold px-2 py-0.5 rounded-full text-xs shadow-[0_0_10px_rgba(217,119,6,0.6)]">3</span>
              {foundComponents.find(c => c.id === 'notif') && <span className="absolute -mt-12 ml-12 bg-black/80 text-3xl p-1.5 rounded-lg border border-purple-600 z-10 drop-shadow-2xl">🔔</span>}
            </div>
            <div onClick={handleWrongElementClick} className="p-3.5 text-sm text-stone-500 hover:text-stone-300 transition-colors cursor-pointer">הגדרות חשבון</div>
          </div>
          <div className="flex-1 pr-4">
            <h3 onClick={handleWrongElementClick} className="font-bold mb-5 text-xl border-b border-[#2d1b4e] pb-3 text-amber-100/80 cursor-pointer hover:text-amber-100 transition-colors">המשימות שלי להיום</h3>
            <div onClick={(e) => { e.stopPropagation(); handleComponentClick('task', '📝'); }} className={`p-4 rounded-xl flex items-center gap-4 border mb-3 ${foundComponents.find(c => c.id === 'task') ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-[#1f1338] border-[#3b2a5c] hover:border-purple-400 cursor-pointer'}`}>
              <div className="w-6 h-6 rounded border-2 border-purple-700 bg-[#16121d]"></div>
              <div className="flex-1">
                <div className="font-medium text-stone-200">לסיים את פרויקט הגמר בבלייזור</div>
                <div className="text-xs text-purple-400 mt-1">היום • תעדוף גבוה</div>
              </div>
              {foundComponents.find(c => c.id === 'task') && <span className="absolute -mt-12 bg-black/80 text-3xl p-1.5 rounded-lg border border-purple-600 z-10 drop-shadow-2xl">📝</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10 bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-purple-900/50 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-50"></div>
        <h3 className="text-2xl font-bold text-amber-300 mb-6 flex items-center gap-2"><Key className="text-amber-500/70"/> מקרא</h3>
        <p className="text-stone-400 text-lg mb-6 text-center">יש להתאים בין האימוג'ים שנאספו לאותיות מטה ולפענח את החידה.<br/>המילה שתתקבל קשורה לקורס התכנות הנלמד.</p>
        <div className="flex justify-center flex-wrap gap-6 mb-8 text-2xl bg-[#16121d]/80 p-6 rounded-xl border border-[#2d1b4e]">
          <div className="text-center"><div>🧑‍💻</div><div className="font-mono text-amber-500 mt-3 font-bold">ק</div></div>
          <div className="text-center"><div>☁️</div><div className="font-mono text-amber-500 mt-3 font-bold">ר</div></div>
          <div className="text-center"><div>🔔</div><div className="font-mono text-amber-500 mt-3 font-bold">ו</div></div>
          <div className="text-center"><div>⚙️</div><div className="font-mono text-amber-500 mt-3 font-bold">ב</div></div>
          <div className="text-center"><div>📅</div><div className="font-mono text-amber-500 mt-3 font-bold">מ</div></div>
          <div className="text-center"><div>🛡️</div><div className="font-mono text-amber-500 mt-3 font-bold">א</div></div>
          <div className="text-center"><div>📝</div><div className="font-mono text-amber-500 mt-3 font-bold">ד</div></div>
        </div>
        <div className="flex flex-col items-center gap-5">
          <p className="text-stone-400 text-lg">יש להזין את הצופן לפתיחת המנעול:</p>
          <div className="flex gap-4">
            <input type="text" value={cipherInput} onChange={(e) => setCipherInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkCipher()} placeholder="הקלידו כאן..." className="bg-[#0f0c16] border-2 border-[#3b2a5c] rounded-xl px-6 py-3 text-center text-3xl text-amber-100 outline-none focus:border-amber-500 font-mono shadow-inner"/>
            <button onClick={checkCipher} disabled={foundComponents.length < 3 || !cipherInput} className="px-8 py-3 bg-gradient-to-r from-purple-800 to-indigo-900 hover:from-purple-700 hover:to-indigo-800 disabled:opacity-40 disabled:grayscale text-amber-50 font-bold rounded-xl transition-all border border-purple-500/30 shadow-[0_0_15px_rgba(147,51,234,0.4)]">פתיחת המנעול</button>
          </div>
        </div>
      </div>
    </div>
  );
  const renderStage2 = () => (
    <div className="flex flex-col h-full animate-fade-in">
       <div className="mb-8 border-b border-purple-900/50 pb-6">
        <h2 className="text-3xl font-bold text-amber-400 flex items-center gap-3 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"><Flame size={28}/> שלב 2: יציקת נתונים</h2>
        <p className="text-stone-400 mt-2 text-lg">יש למיין את מגילות המידע (פרמטרים) לקומפוננטת המשימה ולקומפוננטת המשתמש.<br/>שימו לב - פרמטרים שקשורים למבנה הטירה (Layout) אינם שייכים לכאן, יש להשליך אותם לאש!</p>
      </div>
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div onDragOver={(e) => handleDragOver(e, 'profile')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'profile')} className={`bg-[#1a1025] rounded-2xl border ${dragOverBucket === 'profile' ? 'border-purple-400 ring-2 ring-purple-500/50 scale-[1.02]' : 'border-[#3b2a5c]'} p-5 min-h-[350px] flex flex-col relative shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all`}>
          <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 to-transparent rounded-2xl pointer-events-none"></div>
          <h3 className="font-bold text-purple-300 mb-3 flex items-center gap-2 border-b border-[#3b2a5c] pb-3 text-lg"><User className="text-purple-500"/> כרטיס משתמש</h3>
          <div className="bg-[#0f0c16] p-4 rounded-xl border border-[#2d1b4e] flex items-center gap-4 mb-5 select-none shadow-inner z-10">
            <div className="w-12 h-12 rounded-full bg-purple-900/40 flex items-center justify-center text-purple-300 font-bold border border-purple-500/30 text-lg">א</div>
            <div className="flex flex-col"><span className="text-sm font-bold text-stone-200">ישראל ישראלי</span><span className="text-xs text-purple-400 mt-1">מנהל מערכת</span></div>
          </div>
          <div className="flex flex-col gap-3 flex-1 relative z-10">
            {cards.filter(c => c.bucket === 'profile').map(card => (
              <div key={card.id} className="bg-[#221c2e] p-3 rounded-lg border border-[#4a2e7a] text-sm flex justify-between items-center shadow-md"><span><b className="font-mono text-purple-200">{card.name}</b></span><button onClick={() => moveCard(card.id, 'pool')} className="text-stone-500 hover:text-amber-400 transition-colors"><XCircle size={18}/></button></div>
            ))}
          </div>
        </div>
        <div onDragOver={(e) => handleDragOver(e, 'task')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'task')} className={`bg-[#24150d] rounded-2xl border ${dragOverBucket === 'task' ? 'border-amber-400 ring-2 ring-amber-500/50 scale-[1.02]' : 'border-[#5c3116]'} p-5 min-h-[350px] flex flex-col relative shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all`}>
          <div className="absolute inset-0 bg-gradient-to-b from-amber-900/10 to-transparent rounded-2xl pointer-events-none"></div>
          <h3 className="font-bold text-amber-400 mb-3 flex items-center gap-2 border-b border-[#5c3116] pb-3 text-lg"><CheckSquare className="text-amber-500"/> שורת משימה</h3>
          <div className="bg-[#0f0a07] p-4 rounded-xl border border-[#3b1f0e] flex items-center gap-4 mb-5 select-none shadow-inner z-10">
            <div className="w-5 h-5 border-2 border-amber-700/50 rounded bg-[#1a110b]"></div>
            <div className="flex flex-col"><span className="text-sm font-bold text-stone-200">לסיים את פרויקט הגמר בבלייזור</span></div>
          </div>
          <div className="flex flex-col gap-3 flex-1 relative z-10">
            {cards.filter(c => c.bucket === 'task').map(card => (
              <div key={card.id} className="bg-[#2a1b12] p-3 rounded-lg border border-amber-700/50 text-sm flex justify-between items-center shadow-md"><span><b className="font-mono text-amber-200">{card.name}</b></span><button onClick={() => moveCard(card.id, 'pool')} className="text-stone-500 hover:text-amber-400 transition-colors"><XCircle size={18}/></button></div>
            ))}
          </div>
        </div>
        <div onDragOver={(e) => handleDragOver(e, 'trash')} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, 'trash')} className={`bg-[#16121d] rounded-2xl border ${fireBurst ? 'border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] bg-red-950/20' : dragOverBucket === 'trash' ? 'border-red-500 ring-2 ring-red-500/50 scale-[1.02]' : 'border-stone-800 shadow-[0_0_30px_rgba(0,0,0,0.5)]'} p-5 min-h-[350px] flex flex-col relative transition-all duration-300`}>
          <h3 className="font-bold text-stone-400 mb-3 flex items-center gap-2 border-b border-stone-800 pb-3 text-lg z-10"><Flame className={`transition-all duration-300 ${fireBurst ? 'text-red-400 scale-125' : 'text-red-500/70'}`}/> בור האש (מסיחים)</h3>
          {fireBurst && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden rounded-2xl">
               <div className="text-6xl animate-fire-burst absolute bottom-10">🔥</div>
               <div className="text-5xl animate-fire-burst delay-75 absolute bottom-12 ml-16">🔥</div>
               <div className="text-7xl animate-fire-burst delay-150 absolute bottom-8 mr-14">🔥</div>
            </div>
          )}
          <div className="bg-black/50 p-4 rounded-xl border border-stone-800/50 flex items-center justify-center gap-3 mb-5 text-stone-600 select-none h-[80px] z-10"><span className="text-sm font-medium">יש להשליך לכאן מידע לא רלוונטי</span></div>
          <div className="flex flex-col gap-3 flex-1 relative z-10">
            {cards.filter(c => c.bucket === 'trash').map(card => (
              <div key={card.id} className="bg-stone-900 p-3 rounded-lg border border-red-900/30 text-sm flex justify-between items-center shadow-md"><span><b className="font-mono text-stone-400 line-through decoration-red-900/50">{card.name}</b></span><button onClick={() => moveCard(card.id, 'pool')} className="text-stone-600 hover:text-amber-400 transition-colors"><XCircle size={18}/></button></div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-black/40 backdrop-blur-md p-6 rounded-2xl border border-purple-900/50 flex-1 relative overflow-hidden shadow-xl">
        <h3 className="text-xl font-bold text-amber-100/70 mb-5">מאגר המגילות (פרמטרים)</h3>
        <div className="flex flex-wrap gap-5">
          {cards.filter(c => c.bucket === 'pool').map(card => (
            <div key={card.id} draggable onDragStart={(e) => handleDragStart(e, card.id)} className="bg-[#1a1622] p-5 rounded-xl border border-[#3b2a5c] w-[260px] hover:border-purple-500 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex flex-col justify-between group cursor-grab active:cursor-grabbing">
              <div>
                <div className="font-mono text-lg font-bold text-stone-100 mb-1">{card.name}</div>
                <div className="font-mono text-xs text-amber-500 mb-3 bg-black/50 inline-block px-2.5 py-1 rounded border border-amber-900/30">סוג: {card.type}</div>
                <p className="text-sm text-stone-400 mb-5 h-12 leading-relaxed">{card.desc}</p>
              </div>
              <div className="flex gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                <button onClick={() => moveCard(card.id, 'profile')} className="flex-1 bg-purple-900/40 hover:bg-purple-800 text-purple-200 py-2 rounded-lg transition-colors flex justify-center border border-purple-700/50"><User size={18}/></button>
                <button onClick={() => moveCard(card.id, 'task')} className="flex-1 bg-amber-900/40 hover:bg-amber-800 text-amber-200 py-2 rounded-lg transition-colors flex justify-center border border-amber-700/50"><CheckSquare size={18}/></button>
                <button onClick={() => moveCard(card.id, 'trash')} className="flex-1 bg-red-950/40 hover:bg-red-900/80 text-red-300 py-2 rounded-lg transition-colors flex justify-center border border-red-900/50"><Flame size={18}/></button>
              </div>
            </div>
          ))}
          {cards.filter(c => c.bucket === 'pool').length === 0 && <div className="w-full text-center text-stone-500 italic p-6 text-lg">כל המגילות מוינו. יש ללחוץ על בדיקה.</div>}
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={checkSorting} className="px-8 py-4 bg-gradient-to-r from-purple-800 to-indigo-900 hover:from-purple-700 hover:to-indigo-800 text-amber-50 font-bold rounded-xl transition-all border border-purple-500/30 shadow-[0_0_20px_rgba(147,51,234,0.4)] flex items-center gap-3 text-lg">
          בדיקת יציקת הנתונים <span className="text-2xl drop-shadow-[0_0_5px_rgba(0,0,0,0.5)]">🍲</span>
        </button>
      </div>
    </div>
  );
  const renderStage3 = () => (
    <div className="flex flex-col h-full animate-fade-in pb-12">
      <div className="mb-8 border-b border-purple-900/50 pb-6">
        <h2 className="text-3xl font-bold text-amber-400 flex items-center gap-3 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"><Flame size={28}/> שלב 3: חיווט תקשורת החוצה (Outputs)</h2>
        <p className="text-stone-400 mt-2 text-lg">הקומפוננטה <b>TaskRow</b> צריכה לדווח לעמוד הראשי כשהמשימה הושלמה ולהעביר את ה-<b>TaskId</b>.<br/>שלב זה מחולק להגדרת הלחש (חלק א') ולהפעלתו מתוך אירוע הלחיצה (חלק ב').</p>
      </div>
      <div className={`transition-all duration-700 ${stage3Phase === 2 ? 'opacity-40 grayscale-[30%]' : ''}`}>
        <div className="bg-[#16121d] border border-[#3b2a5c] rounded-2xl p-8 mb-5 relative shadow-[0_0_30px_rgba(0,0,0,0.6)]">
          <div className="absolute top-6 left-6 text-[#3b2a5c]"><Cpu size={36}/></div>
          <h3 className="text-sm text-purple-400 font-bold mb-5 uppercase tracking-widest border-b border-[#2d1b4e] pb-3 pr-2">חלק א': הגדרת הפרמטר בקומפוננטה</h3>
          <div dir="ltr" className="text-left w-full font-mono mt-4">
            <h3 className="text-xl text-stone-500 mb-3">@code {'{'}</h3>
            <div className="min-h-[70px] ml-8 flex flex-wrap items-center gap-3 bg-[#0f0c16] p-5 rounded-xl border border-[#2d1b4e] mb-3 shadow-inner">
              {selectedWords3a.length === 0 && stage3Phase === 1 && <span className="text-stone-600 italic font-sans">ההרכבה כאן...</span>}
              {selectedWords3a.map((word, index) => <button key={`3a-${index}`} onClick={() => stage3Phase === 1 && removeWord3a(index)} className={`bg-[#2d1b4e]/80 border border-purple-500/50 text-amber-100 px-4 py-2 rounded-lg transition-all shadow-md ${stage3Phase === 1 ? 'hover:bg-red-900/80 hover:border-red-500/50 hover:line-through' : 'cursor-default'}`}>{word}</button>)}
            </div>
            <h3 className="text-xl text-stone-500">{'}'}</h3>
          </div>
        </div>
        {stage3Phase === 1 && (
          <div className="bg-black/40 backdrop-blur-md p-6 rounded-2xl border border-purple-900/50 mb-6 shadow-xl">
            <div className="flex flex-wrap gap-4" dir="ltr">
              {stage3aWords.map((word, i) => {
                const isUsed = selectedWords3a.includes(word);
                return <button key={i} onClick={() => handleWordClick3a(word)} disabled={isUsed} className={`px-5 py-2.5 rounded-lg border-b-4 transition-all font-mono font-bold text-sm ${isUsed ? 'bg-[#1a1622] border-[#16121d] text-stone-600 opacity-50 cursor-not-allowed' : 'bg-[#2d1b4e] border-[#1f1338] text-amber-100 hover:bg-[#3b2a5c] hover:-translate-y-1 active:border-b-0 active:translate-y-1 shadow-md'}`}>{word}</button>
              })}
            </div>
          </div>
        )}
        {stage3Phase === 1 && <div className="flex justify-end"><button onClick={checkSequence3a} className="px-8 py-4 bg-gradient-to-r from-purple-800 to-indigo-900 hover:from-purple-700 hover:to-indigo-800 text-amber-50 font-bold rounded-xl transition-all border border-purple-500/30 shadow-[0_0_20px_rgba(147,51,234,0.4)] flex items-center gap-3 text-lg">אימות הגדרה והמשך <ArrowLeft /></button></div>}
      </div>
      {stage3Phase === 2 && (
        <div className="mt-10 animate-fade-in border-t-2 border-dashed border-[#3b2a5c] pt-10">
          <div className="bg-[#16121d] border border-amber-900/50 rounded-2xl p-8 mb-5 relative shadow-[0_0_40px_rgba(217,119,6,0.1)]">
            <div className="absolute top-6 left-6 text-amber-900/40"><Flame size={36}/></div>
            <h3 className="text-sm text-amber-500 font-bold mb-5 uppercase tracking-widest border-b border-[#3b1f0e] pb-3 pr-2">חלק ב': שיגור הנתונים לעמוד הראשי לאחר לחיצה על הכפתור</h3>
            <div dir="ltr" className="text-left w-full font-mono mt-4">
              <h3 className="text-xl text-stone-400">private async Task CompleteTaskClick()</h3>
              <h3 className="text-xl text-stone-500 mb-3">{'{'}</h3>
              <div className="min-h-[70px] ml-8 flex flex-wrap items-center gap-3 bg-[#0f0c16] p-5 rounded-xl border border-[#3b1f0e] mb-3 shadow-inner">
                {selectedWords3b.length === 0 && <span className="text-stone-600 italic font-sans">קוד השיגור יורכב כאן...</span>}
                {selectedWords3b.map((word, index) => <button key={`3b-${index}`} onClick={() => removeWord3b(index)} className="bg-amber-900/40 border border-amber-600/50 text-amber-100 px-4 py-2 rounded-lg hover:bg-red-900/60 hover:border-red-500/50 hover:line-through transition-all shadow-md">{word}</button>)}
              </div>
              <h3 className="text-xl text-stone-500">{'}'}</h3>
            </div>
          </div>
          <div className="bg-black/40 backdrop-blur-md p-6 rounded-2xl border border-amber-900/30 mb-6 shadow-xl">
            <div className="flex flex-wrap gap-4" dir="ltr">
              {stage3bWords.map((word, i) => {
                const isUsed = selectedWords3b.includes(word);
                return <button key={i} onClick={() => handleWordClick3b(word)} disabled={isUsed} className={`px-5 py-2.5 rounded-lg border-b-4 transition-all font-mono font-bold text-sm ${isUsed ? 'bg-[#1a1622] border-[#16121d] text-stone-600 opacity-50 cursor-not-allowed' : 'bg-amber-900/60 border-amber-950 text-amber-100 hover:bg-amber-800/80 hover:-translate-y-1 active:border-b-0 active:translate-y-1 shadow-md'}`}>{word}</button>
              })}
            </div>
          </div>
          <div className="flex justify-end"><button onClick={checkSequence3b} className="px-8 py-4 bg-gradient-to-r from-amber-700 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-stone-950 font-bold rounded-xl transition-all border border-amber-400/50 shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center gap-3 text-lg"><Unlock className="text-stone-900"/> שיגור נתונים ופריצת החדר!</button></div>
        </div>
      )}
    </div>
  );
  const renderUnlocking = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-10">
      <div className="relative animate-pulse">
        <div className="absolute inset-0 bg-amber-500/30 blur-[100px] rounded-full"></div>
        <div className="animate-crack-lock relative z-10">
          <Lock size={180} className="text-amber-500 drop-shadow-[0_0_40px_rgba(245,158,11,0.8)]" />
        </div>
      </div>
      <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-orange-500 animate-pulse drop-shadow-xl">
        פותח את השער...
      </h2>
    </div>
  );
  const renderEscaped = () => (
    <div className="flex flex-col items-center justify-start min-h-[calc(100vh-6rem)] w-full relative z-10 animate-fade-in p-4 pb-20">
      <div className="absolute inset-0 bg-purple-900/10 animate-pulse rounded-full blur-[150px] -z-10 pointer-events-none"></div>
      <div className="text-center max-w-4xl mx-auto mb-10 mt-6">
        <div className="flex items-center justify-center gap-4 mb-4">
          <Unlock size={60} className="text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)] animate-bounce" />
          <h1 className="text-5xl xl:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-orange-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">
            השער נפתח!
          </h1>
        </div>
        <p className="text-xl text-stone-300 bg-black/60 backdrop-blur-md p-6 rounded-2xl border border-purple-900/50 shadow-2xl leading-relaxed">
          הבריחה הושלמה בהצלחה! הופגנה יכולת מרשימה בזיהוי קומפוננטות, בחירת פרמטרים מתאימים והעברתם אל הקומפוננטה ומחוצה לה.
        </p>
      </div>
      <div className="w-full max-w-2xl bg-black/50 backdrop-blur-xl p-5 rounded-3xl border-2 border-amber-900/60 shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col items-center mb-10">
        <h3 className="text-xl font-bold text-amber-300 mb-4 flex items-center gap-2"><Camera className="text-amber-500"/> מזכרת ממרתף השרתים</h3>
        {cameraError ? (
           <div className="w-full aspect-[4/3] bg-[#16121d] rounded-2xl border border-[#3b2a5c] flex items-center justify-center text-center p-6 text-stone-400">
             לא הצלחנו לגשת למצלמה. ייתכן ואין הרשאות, או שאין מצלמה מחוברת למכשיר.
           </div>
        ) : (
          <div className="relative w-full aspect-[4/3] bg-[#16121d] rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
            {!photoDataUrl ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="opacity-0 absolute w-0 h-0 pointer-events-none" />
                <canvas ref={canvasRef} width="800" height="600" className="w-full h-full object-contain bg-black" />
                {!isModelLoaded && !modelFailed && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#16121d]/80 backdrop-blur-sm">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-amber-400 font-bold animate-pulse">טוען קסם לזיהוי פנים...</p>
                  </div>
                )}
              </>
            ) : (
              <img src={photoDataUrl} alt="מזכרת חדר בריחה" className="w-full h-full object-contain bg-black" />
            )}
          </div>
        )}
        {!cameraError && (
          <div className="mt-5 w-full">
            {!photoDataUrl ? (
              <button onClick={takePhoto} className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-500 text-stone-900 font-black rounded-xl transition-all shadow-[0_0_15px_rgba(217,119,6,0.6)] flex items-center justify-center gap-2">
                <Camera size={20} /> צילום תמונת ניצחון
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={retakePhoto} className="flex-1 px-4 py-3 bg-[#2d1b4e] hover:bg-[#3b2a5c] text-purple-200 font-bold rounded-xl transition-all border border-purple-500/30">צילום מחדש</button>
                <a href={photoDataUrl} download="EscapeRoomBlazor_Winner.png" className="flex-[2] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-stone-900 font-black rounded-xl transition-all shadow-[0_0_15px_rgba(5,150,105,0.6)] flex justify-center items-center">
                  שמירת המזכרת
                </a>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-6 w-full max-w-2xl mb-8">
        <button onClick={() => setShowCode(!showCode)} className="flex-1 px-6 py-4 bg-[#2d1b4e] hover:bg-[#3b2a5c] text-purple-200 font-bold rounded-xl text-lg transition-all border border-purple-500/30 shadow-[0_0_20px_rgba(147,51,234,0.3)] flex items-center justify-center gap-3">
          <Code className="text-purple-400" /> {showCode ? 'הסתרת קוד פתרון' : 'צפייה בקוד הקומפוננטה'}
        </button>
        <button onClick={restartGame} className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-900 to-[#3b1c54] hover:from-purple-800 hover:to-[#4a2e7a] text-amber-50 font-bold rounded-xl text-lg transition-all border border-purple-500/30 shadow-[0_0_30px_rgba(147,51,234,0.4)] flex items-center justify-center gap-3">
          <RefreshCw className="text-amber-400" /> כניסה מחדש
        </button>
      </div>
      {showCode && (
        <div className="w-full max-w-4xl bg-[#0a080d] rounded-2xl border border-purple-900/50 shadow-2xl overflow-y-auto max-h-[45vh] custom-scrollbar text-left animate-fade-in" dir="ltr">
          <div className="bg-[#1f1338] px-5 py-3 text-purple-300 font-mono text-sm border-b border-[#3b2a5c] flex justify-between items-center sticky top-0">
            <span className="font-bold tracking-widest text-amber-100">TaskRow.razor</span>
            <span className="text-stone-400 text-xs bg-black/30 px-3 py-1 rounded-full">קומפוננטת המשימה</span>
          </div>
          <div className="p-6 font-mono text-sm overflow-x-auto text-stone-300 leading-relaxed bg-[#16121d]">
<pre>
<span className="text-stone-500">&lt;!-- HTML Markup --&gt;</span>{'\n'}
{'<'}<span className="text-emerald-400">div</span> <span className="text-blue-300">class</span>=<span className="text-green-300">"task-row"</span>{'>\n'}
{'    <'}<span className="text-emerald-400">input</span> <span className="text-blue-300">type</span>=<span className="text-green-300">"checkbox"</span> <span className="text-blue-300">checked</span>=<span className="text-green-300">"@IsCompleted"</span> <span className="text-blue-300">@onchange</span>=<span className="text-green-300">"CompleteTaskClick"</span> /{'>\n'}
{'    <'}<span className="text-emerald-400">span</span>{'>'}@TaskTitle{'</'}<span className="text-emerald-400">span</span>{'>\n'}
{'</'}<span className="text-emerald-400">div</span>{'>\n\n'}
<span className="text-purple-400">@code</span> {'{\n'}
{'    '}<span className="text-amber-400">[Parameter]</span> <span className="text-blue-400">public string</span> TaskTitle {'{ get; set; }\n'}
{'    '}<span className="text-amber-400">[Parameter]</span> <span className="text-blue-400">public bool</span> IsCompleted {'{ get; set; }\n'}
{'    '}<span className="text-amber-400">[Parameter]</span> <span className="text-blue-400">public int</span> TaskId {'{ get; set; }\n'}
{'    '}<span className="text-amber-400">[Parameter]</span> <span className="text-blue-400">public EventCallback&lt;int&gt;</span> OnTaskCompleted {'{ get; set; }\n\n'}
{'    '}<span className="text-blue-400">private async Task</span> CompleteTaskClick(){'\n'}
{'    {\n'}
{'        '}<span className="text-stone-500">// שיגור האירוע לעמוד הראשי</span>{'\n'}
{'        '}<span className="text-purple-400">await</span> OnTaskCompleted.InvokeAsync(TaskId);{'\n'}
{'    }\n'}
{'}'}
</pre>
          </div>
          <div className="bg-[#1f1338] px-5 py-3 text-sky-300 font-mono text-sm border-y border-[#3b2a5c] flex justify-between items-center sticky top-0">
            <span className="font-bold tracking-widest text-amber-100">Task.cs</span>
            <span dir="rtl" className="text-stone-400 text-xs bg-black/30 px-3 py-1 rounded-full">מחלקה (מודל)</span>
          </div>
          <div className="p-6 font-mono text-sm overflow-x-auto text-stone-300 leading-relaxed bg-[#16121d]">
<pre>
<span className="text-blue-400">namespace</span> <span className="text-stone-200">MyApp.Shared</span>{'\n'}
{'{'}{'\n'}
{'    '}<span className="text-blue-400">public class</span> <span className="text-emerald-300">Task</span>{'\n'}
{'    {'}{'\n'}
{'        '}<span className="text-blue-400">public int</span> Id {'{ get; set; }'}{'\n'}
{'        '}<span className="text-blue-400">public string</span> Title {'{ get; set; }'}{'\n'}
{'        '}<span className="text-blue-400">public bool</span> IsCompleted {'{ get; set; }'}{'\n'}
{'    }'}{'\n'}
{'}'}
</pre>
          </div>
          <div className="bg-[#1f1338] px-5 py-3 text-amber-300 font-mono text-sm border-y border-[#3b2a5c] flex justify-between items-center sticky top-0">
            <span className="font-bold tracking-widest text-amber-100">MainPage.razor</span>
            <span className="text-stone-400 text-xs bg-black/30 px-3 py-1 rounded-full">העמוד הראשי</span>
          </div>
          <div className="p-6 font-mono text-sm overflow-x-auto text-stone-300 leading-relaxed bg-[#16121d]">
<pre>
<span className="text-purple-400">@page</span> <span className="text-green-300">"/"</span>{'\n'}
<span className="text-purple-400">@using</span> MyApp.Shared{'\n\n'}
<span className="text-stone-500">&lt;!-- קריאה לקומפוננטה מתוך לולאה בעמוד הראשי --&gt;</span>{'\n'}
<span className="text-purple-400">@foreach</span> (<span className="text-emerald-300">Task</span> task <span className="text-purple-400">in</span> MyTasks){'\n'}
{'{'}{'\n'}
{'    <'}<span className="text-amber-300">TaskRow</span>{'\n'}
{'        '}TaskTitle=<span className="text-green-300">"@task.Title"</span>{'\n'}
{'        '}IsCompleted=<span className="text-green-300">"@task.IsCompleted"</span>{'\n'}
{'        '}TaskId=<span className="text-green-300">"@task.Id"</span>{'\n'}
{'        '}OnTaskCompleted=<span className="text-green-300">"HandleTaskCompleted"</span> /{'>\n'}
{'}'}{'\n\n'}
<span className="text-purple-400">@code</span> {'{\n'}
{'    '}<span className="text-blue-400">private</span> List&lt;<span className="text-emerald-300">Task</span>&gt; MyTasks = <span className="text-blue-400">new</span>(){'\n'}
{'    {\n'}
{'        '}<span className="text-blue-400">new</span> <span className="text-emerald-300">Task</span> {'{ Id = 1, Title = '}<span className="text-green-300">"לסיים את פרויקט הגמר בבלייזור"</span>{', IsCompleted = '}<span className="text-blue-400">false</span>{' },\n'}
{'        '}<span className="text-blue-400">new</span> <span className="text-emerald-300">Task</span> {'{ Id = 2, Title = '}<span className="text-green-300">"ללמוד על תקשורת בין קומפוננטות"</span>{', IsCompleted = '}<span className="text-blue-400">true</span>{' }\n'}
{'    };\n\n'}
{'    '}<span className="text-blue-400">private void</span> HandleTaskCompleted(<span className="text-blue-400">int</span> taskId){'\n'}
{'    {\n'}
{'        '}<span className="text-stone-500">// לוגיקה לטיפול בסיום המשימה...</span>{'\n'}
{'    }\n'}
{'}'}
</pre>
          </div>
        </div>
      )}
    </div>
  );
  return (
    <div className="min-h-screen bg-[#0a080d] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#2a0f42] via-[#0a080d] to-black text-stone-200 font-sans p-6" dir="rtl">
      <style>{`
        @keyframes smokeIn {
          0% { opacity: 0; filter: blur(20px); border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translateX(-50%) translateY(20px) scale(0.8); }
          100% { opacity: 1; filter: blur(0px); border-radius: 0.75rem; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes smokeOut {
          0% { opacity: 1; filter: blur(0px); border-radius: 0.75rem; transform: translateX(-50%) translateY(0) scale(1); }
          100% { opacity: 0; filter: blur(20px); border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; transform: translateX(-50%) translateY(-20px) scale(1.1); }
        }
        .animate-smoke-in { animation: smokeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-smoke-out { animation: smokeOut 0.6s cubic-bezier(0.7, 0, 0.84, 0) forwards; }
        @keyframes fireBurstAnim {
          0% { transform: translateY(10px) scale(0.5); opacity: 0; }
          20% { opacity: 1; transform: translateY(-10px) scale(1.2); }
          100% { transform: translateY(-70px) scale(1.5); opacity: 0; filter: blur(4px); }
        }
        .animate-fire-burst { animation: fireBurstAnim 0.7s ease-out forwards; }
        @keyframes crackLock {
          0%, 20%, 40%, 60%, 80% { transform: translateX(-5px) rotate(-5deg) scale(1); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(5px) rotate(5deg) scale(1.1); }
          100% { transform: scale(1.4) rotate(-15deg); opacity: 0; filter: blur(10px); }
        }
        .animate-crack-lock { animation: crackLock 2.8s ease-in-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #16121d; border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b2a5c; border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4c1d95; }
      `}</style>
      {renderMessage()}
      <div className="max-w-6xl mx-auto h-full relative z-10 flex items-center justify-center">
        {stage === 'intro' && renderIntro()}
        {stage === 'stage1' && renderStage1()}
        {stage === 'stage2' && renderStage2()}
        {stage === 'stage3' && renderStage3()}
        {stage === 'unlocking' && renderUnlocking()}
        {stage === 'escaped' && renderEscaped()}
      </div>
    </div>
  );
}
