# Data Dictionary (พจนานุกรมข้อมูล)
สำหรับโครงสร้างฐานข้อมูล (OpenSearch) ของระบบแชทบอทวิเคราะห์ข้อมูล (OG-Extractor)

---

### **1. ตารางข้อมูลผู้ใช้งาน (USERS)**
เก็บข้อมูลประจำตัวและการตั้งค่าบัญชี (Settings) ของผู้ใช้งานที่ล็อกอินผ่าน Google

| Table | Column | Data type | Nullable | Key | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| USERS | user_id | String | No | PK | รหัสประจำตัวชี้วัดตัวตน (ดึงมาจาก Google Auth UID) |
| USERS | email | String | No | - | อีเมลแอดเดรสของผู้ใช้งาน |
| USERS | display_name | String | No | - | ชื่อแสดงผลบนหน้าจอแอปพลิเคชัน |
| USERS | openrouter_key | String | Yes | - | กุญแจเชื่อมต่อ API ส่วนตัวที่เข้ารหัส (Encrypted API Key) |
| USERS | selected_theme | String | Yes | - | ธีมสีหน้าจอที่เซฟไว้ (เช่น "light", "dark", "forest-green") |
| USERS | selected_model | String | Yes | - | โมเดล AI ที่ตั้งค่าไว้ล่าสุด (จดจำข้ามเครื่อง) |
| USERS | created_at | DateTime | No | - | วันเวลาประทับเมื่อบัญชีนี้ถูกสร้างขึ้นครั้งแรก |

---

### **2. ตารางข้อมูลรอบการสนทนา (CHAT_SESSIONS)**
เก็บข้อมูลชื่อเรื่องของแต่ละหน้าต่างแชท ใช้ควบรวมเนื้อหาและอ้างอิงเป็นแกนความจำระยะยาว

| Table | Column | Data type | Nullable | Key | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| CHAT_SESSIONS | session_id | String | No | PK | รหัสประจำรอบการสนทนา (สร้างด้วย UUID) |
| CHAT_SESSIONS | user_id | String | No | FK | รหัสผู้ใช้งาน (เชื่อมโยงใครเป็นเจ้าของห้องแชทนี้) |
| CHAT_SESSIONS | title | String | No | - | ชื่อหัวเรื่องอัตโนมัติของโฟลเดอร์แชท |
| CHAT_SESSIONS | summary | Text | Yes | - | ข้อความควบรวมสรุปประวัติแชททั้งหมดใน Session นั้นๆ |
| CHAT_SESSIONS | is_public | Boolean | No | - | สถานะแชร์แชทแบบสาธารณะ (1 = True, 0 = False) |
| CHAT_SESSIONS | updated_at | DateTime | No | - | เวลาล่าสุดที่มีการความเคลื่อนไหวในห้องแชทนี้ |

---

### **3. ตารางประวัติข้อความ (AI_CHAT_LOGS)**
เก็บข้อมูลข้อความดิบแบบเรียงบรรทัด ใช้ดึงไปแสดงผลพ่นบนกล่องแชทของหน้าต่าง

| Table | Column | Data type | Nullable | Key | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| AI_CHAT_LOGS | log_id | String | No | PK | รหัสอ้างอิงข้อความแชทแต่ละกล่องคำพูด (UUID) |
| AI_CHAT_LOGS | session_id | String | No | FK | รหัสอ้างอิงห้องสนทนา เพื่อดึงข้อมาให้โชว์ถูกห้อง |
| AI_CHAT_LOGS | role | String | No | - | บทบาทผู้ส่งข้อความ (เช่น `user`, `assistant`, `system`) |
| AI_CHAT_LOGS | content | Text | No | - | เนื้อหาข้อความดิบ / รหัสคำสั่งวาดภาพ / หรือลิงก์เว็บ |
| AI_CHAT_LOGS | extracted_data | Text | Yes | - | ข้อมูลการสแกนที่ถูกสกัดมาจากไฟล์ PDF หรือจากเว็บไซต์ |
| AI_CHAT_LOGS | timestamp | DateTime | No | - | ประทับเวลาเสี้ยววินาทีเพื่อใช้เรียงลำดับการคุยก่อน-หลัง |

---

### **4. ตารางสถิติปริมาณโควตากลาง (TOKEN_USAGE)**
คลังย่อยเก็บตัวเลขสถิติปริมาณโควตาที่ใช้ไป เพื่อนำไปแสดงในหน้า Dashboard ของแอดมินโดยเฉพาะ

| Table | Column | Data type | Nullable | Key | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| TOKEN_USAGE | usage_id | String | No | PK | รหัสบันทึกตารางสถิติค่าใช้จ่ายกระแส 1 คำสั่ง (UUID) |
| TOKEN_USAGE | log_id | String | No | FK | รหัสโยงกลับไปอ้างอิงว่าข้อมูลการใช้นี้ตัวเลขมาจากแชทไหน |
| TOKEN_USAGE | prompt_tokens | Integer | No | - | ปริมาณโทเคนขาเข้าฝั่งคำถาม (รวม Context เก่าในห้อง) |
| TOKEN_USAGE | completion_tokens| Integer | No | - | ปริมาณโทเคนขาออก (ตัวอักษรที่ AI เพิ่งเจนตอบใหม่) |
| TOKEN_USAGE | total_tokens | Integer | No | - | ยอดรวมโทเคนที่เสียไปในคำสั่งดังกล่าว (ผลรวม 2 ค่าด้านบน) |
| TOKEN_USAGE | model_used | String | No | - | ชื่อโมเดล AI ปลายทางที่ทำงานคำสั่งนี้ไป (เช่น `gemma-3`) |

---

### **5. ตารางประเมินคุณภาพและจับปัญหา (PROMPT_EVALUATIONS)**
ส่วนเก็บ Logs ข้อความแจ้งเตือน Error ระดับระบบ (System Failure) หรือบันทึกคะแนนโหวตจากผู้ใช้

| Table | Column | Data type | Nullable | Key | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| PROMPT_EVALUATIONS| eval_id | String | No | PK | รหัสบันทึกการตรวจสอบคุณภาพการตอบหรือร้องแจ้งปัญหา |
| PROMPT_EVALUATIONS| log_id | String | No | FK | รหัสเชื่อมโยงสู่ประวัติข้อความฝั่ง AI (Assistant) ตัวก่อปัญหา |
| PROMPT_EVALUATIONS| rating | Integer | Yes | - | ตัววัดคะแนน (เช่น 1=ผลลัพธ์ดี, 0=เฉยๆ, -1=เกิด Error) |
| PROMPT_EVALUATIONS| error_feedback| Text | Yes | - | ข้อความบรรยายสาเหตุข้อผิดพลาด ไม่ว่าจะจากผู้ใช้หรือระบบ |
| PROMPT_EVALUATIONS| evaluated_at | DateTime | No | - | วันและเวลาที่เกิดการให้คะแนนประเมินผล หรือเวลาที่ระบบบันทึกข้อผิดพลาด |
