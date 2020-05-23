import { validationResult, Result, ValidationError } from 'express-validator';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import * as config from '../../../global/env.json';
import { sendMail } from '../utils/transporter';
import { check } from '../utils/check';
import User from '../models/user';

export const postSignup = (
    req: Request<any>,
    res: Response<any>,
    next: NextFunction
) => {
    const errors: Result<ValidationError> = validationResult(req);
    check({
        check: errors.isEmpty(),
        errorMessage: 'Validation failed.',
        errorCode: 422,
        data: errors.array(),
    });

    const email: string = req.body.email;
    const password: string = req.body.password;

    bcrypt
        .hash(password, 12)
        .then((hashedPw) => {
            const user = new User({
                email,
                password: hashedPw,
            });
            return user.save();
        })
        .then((result) => {
            res.status(201).json({
                message: 'User created!',
                userId: result._id,
            });
            return sendMail({
                to: email,
                subject: 'Signup succeeded!',
                template: '<h1>You successfully signed up!</h1>',
            });
        })
        .catch((err: any) => {
            if (!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        });
};

export const postLogin = (
    req: Request<any>,
    res: Response<any>,
    next: NextFunction
) => {
    const errors: Result<ValidationError> = validationResult(req);
    check({
        check: errors.isEmpty(),
        errorMessage: 'Validation failed.',
        errorCode: 422,
        data: errors.array(),
    });

    const email: string = req.body.email;
    const password: string = req.body.password;
    let loadedUser: any;

    User.findOne({ email })
        .then((user: any) => {
            check({
                check: !!user,
                errorMessage: 'A user with this email could not be found.',
            });
            loadedUser = user;
            return bcrypt.compare(password, user.password);
        })
        .then((isEqual: boolean) => {
            check({
                check: isEqual,
                errorMessage: 'Wrong password.',
            });
            const token: string = jwt.sign(
                {
                    email: loadedUser.email,
                    userId: loadedUser._id.toString(),
                },
                config.backend.jwt.jsonwebtoken,
                { expiresIn: config.backend.jwt.expiresIn }
            );
            res.status(200).json({
                token: token,
                userId: loadedUser._id.toString(),
            });
        })
        .catch((err) => {
            if (!err.statusCode) {
                err.statusCode = 500;
            }
            next(err);
        });
};

export const postReqForReset = (
    req: Request<any>,
    res: Response<any>,
    next: NextFunction
) => {
    crypto.randomBytes(32, (err, buffer) => {
        if (err) {
            console.log(err);
            const error = new Error(err as any);
            (error as any).httpStatusCode = 500;
            throw error;
        }
        const token = buffer.toString('hex');
        User.findOne({ email: req.body.email })
            .then((user: any) => {
                check({
                    check: !!user,
                    errorMessage: 'A user with this email could not be found.',
                });
                user.resetToken = token;
                user.resetTokenExpiration = Date.now() + 300000;
                return user.save();
            })
            .then((result) => {
                res.status(201).end();
                sendMail({
                    to: req.body.email,
                    subject: 'Password reset',
                    template: `
            <p>You requested a password reset</p>
            <p>Click this <a href="http://localhost:3000/reset/${token}">link</a> to set a new password.</p>
          `,
                });
            })
            .catch((errr: any) => {
                const error = new Error(errr);
                (error as any).httpStatusCode = 500;
                return next(error);
            });
    });
};

export const postResetPassword = (
    req: Request<any>,
    res: Response<any>,
    next: NextFunction
) => {
    const newPassword = req.body.password;
    const resetToken = req.body.resetToken;
    let resetUser;

    User.findOne({
        resetToken,
        resetTokenExpiration: { $gt: Date.now() },
    })
        .then((user: any) => {
            check({ check: !!user, errorMessage: 'Invalid reset tokens' });
            resetUser = user;
            return bcrypt.hash(newPassword, 12);
        })
        .then((hashedPassword) => {
            resetUser.password = hashedPassword;
            resetUser.resetToken = undefined;
            resetUser.resetTokenExpiration = undefined;
            return resetUser.save();
        })
        .then((result) => {
            res.status(201).json({
                message: 'Password reseted successfully!',
            });
        })
        .catch((err) => {
            const error = new Error(err);
            (error as any).httpStatusCode = 500;
            return next(error);
        });
};
