import { Router } from 'express';
import { StudentController } from '../controllers/student.controller';
import { requireAuth } from '../middlewares/auth.middleware';  

const router = Router();
const studentController = new StudentController();

// Obtener información del curso del estudiante actual
router.get('/my-course', requireAuth, studentController.getMyCourse);  
export default router;