import { Router } from 'express';
import { ClaseMuestraController } from '../controllers/claseMuestraController';

const router = Router();

// Rutas públicas
router.post('/', ClaseMuestraController.create);

// Rutas protegidas (para admin)
router.get('/', ClaseMuestraController.getAll);
router.get('/:id', ClaseMuestraController.getById);
router.delete('/:id', ClaseMuestraController.delete);

export default router;