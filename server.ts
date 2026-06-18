import express from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  let vite: any = null;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
  }

  // API Routes
  app.post("/api/send-email", async (req, res) => {
    const { name, email, subject, message } = req.body;
    console.log(`Intentando enviar correo de: ${email}`);

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Check if secrets are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("EMAIL_USER or EMAIL_PASS missing. Entering Simulation Mode.");
      return res.json({ 
        success: true, 
        simulated: true,
        message: "Configuración pendiente: Los correos no se enviarán realmente hasta que configures EMAIL_USER y EMAIL_PASS en los Secretos." 
      });
    }

    console.log(`Configurado: User=${process.env.EMAIL_USER.substring(0, 3)}... Pass=${process.env.EMAIL_PASS.length} chars`);

    const recipient = process.env.EMAIL_TO || "ventas@gctmva.com.mx";

    try {
      console.log(`Intentando enviar correo desde ${process.env.EMAIL_USER} para ${recipient}`);
      
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER?.trim(),
          pass: process.env.EMAIL_PASS?.replace(/\s+/g, ""),
        },
      });

      const mailOptions = {
        from: `"GCT Web Contact" <${process.env.EMAIL_USER}>`,
        to: recipient,
        replyTo: email,
        subject: `[WEB] Contacto: ${name} - ${subject}`,
        text: `Has recibido un nuevo mensaje desde el sitio web de GCT MVA.\n\n` +
              `DETALLES DEL CONTACTO:\n` +
              `----------------------\n` +
              `Nombre: ${name}\n` +
              `Email: ${email}\n` +
              `Asunto: ${subject}\n\n` +
              `MENSAJE:\n` +
              `${message}\n\n` +
              `--- Enviado automáticamente desde gctmva.com.mx ---`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px;">
              <h1 style="color: #0c4a6e; margin: 0; font-size: 24px; font-weight: 800;">GCT MVA</h1>
              <p style="color: #64748b; margin: 5px 0 0 0; text-transform: uppercase; letter-spacing: 1px; font-size: 12px; font-weight: 600;">Nueva consulta web</p>
            </div>
            
            <div style="background-color: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 25px; border-left: 4px solid #0ea5e9;">
              <p style="margin: 0 0 10px 0;"><strong style="color: #0c4a6e;">De:</strong> ${name}</p>
              <p style="margin: 0 0 10px 0;"><strong style="color: #0c4a6e;">Email:</strong> <a href="mailto:${email}" style="color: #0284c7; text-decoration: none;">${email}</a></p>
              <p style="margin: 0;"><strong style="color: #0c4a6e;">Asunto:</strong> ${subject}</p>
            </div>

            <div style="padding: 10px 5px; line-height: 1.6;">
              <p style="color: #475569; font-weight: 600; margin-bottom: 10px;">Mensaje:</p>
              <div style="color: #1e293b; white-space: pre-wrap; background: #ffffff; padding: 15px; border: 1px dashed #cbd5e1; border-radius: 8px;">${message}</div>
            </div>

            <div style="margin-top: 35px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8;">
              <p>Este es un correo automático generado por el formulario de la página web.</p>
              <p>© ${new Date().getFullYear()} GCT MVA. Todos los derechos reservados.</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log("¡Correo enviado con éxito!");
      res.json({ success: true });
    } catch (error: any) {
      console.error("ERROR CRÍTICO SMTP:", error);
      
      const errorMsg = error.message || "";
      const isAuthError = errorMsg.includes("535") || 
                         errorMsg.includes("Invalid login") || 
                         errorMsg.includes("not accepted");
      
      res.status(isAuthError ? 401 : 500).json({ 
        error: isAuthError ? "Error de Autenticación" : "Error de Servidor",
        details: errorMsg,
        needsConfig: true,
        isAuth: isAuthError
      });
    }
  });

  // Helper for rendering HTML pages through Vite in development, or sending static build files in production
  const renderHtml = async (req: express.Request, res: express.Response, next: express.NextFunction, filePath: string) => {
    if (process.env.NODE_ENV !== "production" && vite) {
      try {
        const fullPath = path.resolve(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
          const template = fs.readFileSync(fullPath, "utf-8");
          const html = await vite.transformIndexHtml(req.originalUrl || req.url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } else {
          res.status(404).end("Not Found");
        }
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    } else {
      res.sendFile(path.join(process.cwd(), "dist", filePath));
    }
  };

  // Friendly URL routing mapped to static HTML resources
  app.get("/", (req, res, next) => {
    renderHtml(req, res, next, "index.html");
  });

  app.get(["/conocenos", "/nosotros"], (req, res, next) => {
    renderHtml(req, res, next, "nosotros.html");
  });

  app.get("/servicios", (req, res, next) => {
    renderHtml(req, res, next, "servicios.html");
  });

  app.get("/contacto", (req, res, next) => {
    renderHtml(req, res, next, "contacto.html");
  });

  // Serve specific static HTML filenames directly if needed (fallback)
  app.get(["/index.html", "/nosotros.html", "/servicios.html", "/contacto.html"], (req, res, next) => {
    const filePath = req.path.substring(1); // e.g. "contacto.html"
    renderHtml(req, res, next, filePath);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && vite) {
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
