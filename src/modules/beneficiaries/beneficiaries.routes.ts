import { Router } from 'express';
import * as controller from './beneficiaries.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', controller.listBeneficiaries);
router.post('/', controller.createBeneficiary);
router.patch('/:id', controller.updateBeneficiary);
router.delete('/:id', controller.deleteBeneficiary);

export default router;