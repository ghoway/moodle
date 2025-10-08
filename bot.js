const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const { scrapeMoodle } = require('./src/moodleScraper');

// --- DATA JADWAL KULIAH (STATIS) ---
const jadwalKuliah = [
    { hari: 'Senin', nama: 'Kewirausahaan II', dosen: 'Rengga Sendrian, M.Hum.', waktu: '18:30 - 20:10', jenis: 'Elearning' },
    { hari: 'Selasa', nama: 'Bahasa Inggris I', dosen: 'Irma Rahmawati, S.S., M.Sas', waktu: '18:30 - 20:10', jenis: 'Elearning' },
    { hari: 'Rabu', nama: 'Kompleksitas Algoritma', dosen: 'Bias Yulisa Geni, M.Kom.', waktu: '18:30 - 21:00', jenis: 'Tatap Maya' },
    { hari: 'Kamis', nama: 'Pemrograman Basis Data', dosen: 'Irfan Nurdiansyah, S.Kom., M.Kom.', waktu: '18:30 - 21:00', jenis: 'Tatap Maya' },
    { hari: 'Jumat', nama: 'Pendidikan Agama Islam', dosen: 'Asrori, MA.', waktu: '18:30 - 20:10', jenis: 'Elearning' },
    { hari: 'Sabtu', nama: 'Matematika Diskrit', dosen: 'Dian Gustina, S.Kom., MMSI.', waktu: '07:30 - 10:00', jenis: 'Tatap Maya' },
    { hari: 'Sabtu', nama: 'Pemrograman Berorientasi Objek', dosen: 'Ari Hidayatullah, S.SI., M.Kom.', waktu: '10:05 - 12:35', jenis: 'Tatap Maya' }
];

async function connectToWhatsApp() {
  console.log('🚀 Meluncurkan browser untuk scraping...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({ logger: pino({ level: 'silent' }), auth: state });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('------------------------------------------------');
      console.log('Silakan scan QR code ini untuk menghubungkan WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('------------------------------------------------');
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus karena:', lastDisconnect.error, ', menyambungkan ulang:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        browser.close().then(() => console.log('Browser ditutup karena bot logout.'));
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WhatsApp berhasil terhubung!');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    const command = text.toLowerCase().trim();
    const sender = msg.key.participant || msg.key.remoteJid;
    const groupJid = msg.key.remoteJid;

    if (command.startsWith('.kulon ')) {
      const keyword = text.substring(6).trim();
      if (!keyword) {
        await sock.sendMessage(groupJid, { text: 'Gunakan format: .kulon (nama matakuliah)' }, { quoted: msg });
        return;
      }
      try {
        await sock.sendMessage(groupJid, { text: `⏳ Mencari data untuk matakuliah "*${keyword}*", mohon tunggu...` }, { quoted: msg });
        const result = await scrapeMoodle(browser, keyword);
        if (result.error) {
          await sock.sendMessage(groupJid, { text: `❌ ${result.error}` }, { quoted: msg });
          return;
        }
        // **PERUBAHAN DI SINI**: Tambahkan "Tugas" ke format balasan
        const reply = [
          `*${result.courseName} - ${result.weekDate}*`,
          `└ Section : ${result.sectionLink}`,
          `└ Quiz : ${result.quizLink || 'Tidak Ada Quiz'}`,
          `└ Forum : ${result.forumLink || 'Tidak Ada Forum'}`,
          `└ Gmeet : ${result.gmeetLink || 'Tidak Ada Gmeet'}`,
          `└ Module : ${result.moduleLink || 'Tidak Ada Module'}`,
          `└ Tugas : ${result.assignmentLink || 'Tidak Ada Tugas'}`
        ].join('\n');
        await sock.sendMessage(groupJid, { text: reply }, { quoted: msg });
      } catch (err) {
        console.error(err);
        await sock.sendMessage(groupJid, { text: 'Terjadi error internal saat memproses permintaan Anda.' }, { quoted: msg });
      }
    } 
    else if (command === '.help') {
      // **PERUBAHAN DI SINI**: Update pesan .help
      const helpMessage = `*🤖 Bantuan Bot Moodle 🤖*\n\nBerikut adalah daftar perintah yang tersedia:\n\n1. *.kulon <nama_matkul>*\n   - _Fungsi:_ Mencari info perkuliahan (termasuk Tugas) di minggu ini.\n   - _Contoh:_ .kulon algoritma\n\n2. *.jadwal*\n   - _Fungsi:_ Menampilkan jadwal kuliah mingguan.\n   - _Contoh:_ .jadwal\n\n3. *.today*\n   - _Fungsi:_ Menampilkan jadwal kuliah hari ini.\n   - _Contoh:_ .today\n\n4. *.all*\n   - _Fungsi:_ Mention semua anggota grup (Hanya Admin).\n   - _Contoh:_ .all Mohon perhatiannya\n\n5. *.help*\n   - _Fungsi:_ Menampilkan pesan bantuan ini.\n   - _Contoh:_ .help`;
      
      await sock.sendMessage(groupJid, { text: helpMessage }, { quoted: msg });
    }
    else if (command.startsWith('.all')) {
      if (!groupJid.endsWith('@g.us')) {
        await sock.sendMessage(groupJid, { text: '❌ Perintah ini hanya bisa digunakan di dalam grup.' }, { quoted: msg });
        return;
      }
      try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const participants = groupMetadata.participants;
        const senderInfo = participants.find(p => p.id === sender);
        if (!senderInfo?.admin) {
          await sock.sendMessage(groupJid, { text: '❌ Perintah ini hanya bisa digunakan oleh admin grup.' }, { quoted: msg });
          return;
        }
        const messageText = text.substring(4).trim() || '@all';
        const mentions = participants.map(p => p.id);
        await sock.sendMessage(groupJid, { text: messageText, mentions: mentions }, { quoted: msg });
      } catch (err) {
        console.error(err);
        await sock.sendMessage(groupJid, { text: 'Gagal mengambil data anggota grup.' }, { quoted: msg });
      }
    }
    else if (command === '.jadwal') {
        let reply = "🗓️ *Jadwal Kuliah Mingguan* 🗓️\n\n";
        jadwalKuliah.forEach(kelas => {
            reply += `*${kelas.hari}* - ${kelas.waktu}\n`;
            reply += `📚 ${kelas.nama}\n`;
            reply += `👤 _${kelas.dosen}_\n`;
            reply += `💻 ${kelas.jenis}\n\n`;
        });
        await sock.sendMessage(groupJid, { text: reply.trim() }, { quoted: msg });
    }
    else if (command === '.today') {
        const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const hariIni = namaHari[new Date().getDay()];
        const jadwalHariIni = jadwalKuliah.filter(kelas => kelas.hari === hariIni);
        if (jadwalHariIni.length === 0) {
            await sock.sendMessage(groupJid, { text: `Tidak ada jadwal kuliah hari ini (*${hariIni}*). Waktunya istirahat! 🎉` }, { quoted: msg });
            return;
        }
        let reply = `📚 *Jadwal Hari Ini (${hariIni})* 📚\n\n`;
        jadwalHariIni.forEach(kelas => {
            reply += `*${kelas.waktu}*\n`;
            reply += `» ${kelas.nama}\n`;
            reply += `» _${kelas.dosen}_\n`;
            reply += `» ${kelas.jenis}\n\n`;
        });
        await sock.sendMessage(groupJid, { text: reply.trim() }, { quoted: msg });
    }
  });
}

connectToWhatsApp();