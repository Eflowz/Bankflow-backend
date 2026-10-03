import type { Request, Response, NextFunction } from 'express';
import { currentUser } from '../../middleware/auth.middleware.js';
import { requireParam } from '../../utils/req-params.js';
import {
  CreateBeneficiarySchema,
  UpdateBeneficiarySchema,
} from './beneficiaries.schema.js';
import * as service from './beneficiaries.service.js';

export async function listBeneficiaries(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const beneficiaries = await service.listBeneficiaries(user.sub);
    res.status(200).json({ data: beneficiaries });
  } catch (err) {
    next(err);
  }
}

export async function createBeneficiary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const input = CreateBeneficiarySchema.parse(req.body);
    const beneficiary = await service.createBeneficiary(user.sub, input);
    res.status(201).json({ data: beneficiary });
  } catch (err) {
    next(err);
  }
}

export async function updateBeneficiary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const id = requireParam(req.params.id, 'id');
    const input = UpdateBeneficiarySchema.parse(req.body);
    const beneficiary = await service.updateBeneficiary(user.sub, id, input);
    res.status(200).json({ data: beneficiary });
  } catch (err) {
    next(err);
  }
}

export async function deleteBeneficiary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = currentUser(req);
    const id = requireParam(req.params.id, 'id');
    await service.deleteBeneficiary(user.sub, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}