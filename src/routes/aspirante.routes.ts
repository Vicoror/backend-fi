import { Router } from 'express';
import { 
  registrarAspirante, 
  getHorariosDisponibles, 
  getNivelesDisponibles 
} from '../controllers/aspirante.controller';

const router = Router();

router.post('/registrar', registrarAspirante);
router.get('/horarios', getHorariosDisponibles);
router.get('/niveles', getNivelesDisponibles);

export default router;