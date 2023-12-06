import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import pg from 'pg';
import translate from 'translate-google'
import axios from 'axios'
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.json());

const pool = new pg.Pool({
    connectionString: 'postgres://prosw_user:BGgijwXgecGFdpz5fl5ULbIVyVC8osRL@dpg-cln9cn0apebc739l8s1g-a.oregon-postgres.render.com/prosw', // Asegúrate de usar tus propios datos
    ssl: {
        rejectUnauthorized: false
    }
});


app.post('/translate', async (req, res)=>{
    const {msg, to}=req.body
    const translation = await translate(msg,{from: 'auto', to: to })
    res.status(200).json({translation})
})
app.get('/', (req, res) => {
    res.send('Welcome to the Express and Socket.IO server!');
});

// Estructura para almacenar las asociaciones de sockets con números de teléfono
const socketToUserMapping = {};

io.on('connection', (socket) => {
    console.log('A user connected');


    
    
    socket.on('register', (phone) => {
        socketToUserMapping[socket.id] = phone;
        console.log(`El teléfono ${phone} ha sido registrado con el socket ID ${socket.id}`);
    });

    socket.on('send_message', async (data) => {
        console.log('Mensaje recibido:', data);
        const { sourcePhone, targetPhone, message,sourceLanguage, targetLanguage } = data;
        console.log(targetLanguage);
        const response = await axios.post('http://localhost:3000/translate', {
            msg: message,
            to: targetLanguage
          });
          const translatedMessage = response.data.translation;
          console.log(translatedMessage);
          socket.emit('translation_result', {
            translation: translatedMessage,
            sourcePhone: sourcePhone,
            targetPhone: targetPhone,
          });
    
          const receiverSocketId = Object.keys(socketToUserMapping).find(key => socketToUserMapping[key] === targetPhone);
          if (receiverSocketId) {
              io.to(receiverSocketId).emit('new_message', {
                from: sourcePhone,
                //to: targetPhone,
                message: message, 
                translatedMessage: translatedMessage,
              });
              console.log(`Mensaje reenviado al número ${targetPhone}`);
          } else {
              console.log(`No se encontró el socket para el número ${targetPhone}`);
          }
    });

    socket.on('disconnect', () => {
        const phone = socketToUserMapping[socket.id];
        delete socketToUserMapping[socket.id];
        console.log(`El teléfono ${phone} se ha desconectado y eliminado del registro.`);
    });
});

async function deleteOldMessages() {
    const retentionPeriod = '7 days'; // ajusta esto según tus necesidades
    try {
        await pool.query(`DELETE FROM messages WHERE created_at < NOW() - INTERVAL '${retentionPeriod}'`);
        console.log('Old messages deleted');
    } catch (error) {
        console.error('Error deleting old messages:', error);
    }
}



app.post('/register', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).send('Phone number is required');
    }
    try {
        const userExists = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (userExists.rowCount > 0) {
            return res.status(409).send('User already exists');
        }
        await pool.query('INSERT INTO users (phone) VALUES ($1)', [phone]);
        res.status(201).send('User registered');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

app.post('/login', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).send('Phone number is required');
    }
    try {
        const user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (user.rowCount === 0) {
            return res.status(404).send('User not found');
        }
        res.status(200).send('User logged in');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});


app.post('/add_contact', async (req, res) => {
    const { userPhone, contactName, contactPhone } = req.body;

    // Verifica si los datos necesarios se proporcionan en la solicitud.
    if (!userPhone || !contactName || !contactPhone) {
        return res.status(400).send('User phone, contact name, and contact phone are required');
    }

    try {
        // Verifica si el nombre del contacto ya existe para este usuario en la base de datos.
        const contactExists = await pool.query('SELECT * FROM contacts WHERE user_phone = $1 AND contact_name = $2', [userPhone, contactName]);

        // Si el contacto ya existe, devuelve un error 409 (conflicto).
        if (contactExists.rowCount > 0) {
            return res.status(409).send('Contact with this name already exists for this user');
        }

        // Inserta el nuevo contacto en la base de datos.
        await pool.query('INSERT INTO contacts (user_phone, contact_name, contact_phone) VALUES ($1, $2, $3)', [userPhone, contactName, contactPhone]);

        // Envía una respuesta de éxito (códFigo 201) cuando se agrega el contacto.
        res.status(201).send('Contact added');
    } catch (error) {
        // En caso de un error en la base de datos u otro error, devuelve un error 500 (error del servidor).
        console.error(error);
        res.status(500).send('Server error');
    }
});

app.get('/get_contacts/:userPhone', async (req, res) => {
    const { userPhone } = req.params;
  
    try {
      const contacts = await pool.query('SELECT * FROM contacts WHERE user_phone = $1', [userPhone]);
      
      res.status(200).json(contacts.rows);
    } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
    }
  });
  


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
