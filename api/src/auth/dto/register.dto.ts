import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Public password registration — Email or Phone + Password (worker or employer) */
export class RegisterDto {
  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  emailOrPhone?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email noto'g'ri" })
  email?: string;

  @IsString()
  @MinLength(8, { message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(128, { message: 'Parol 128 ta belgidan oshmasligi kerak' })
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Ism kamida 2 ta belgidan iborat bo'lishi kerak" })
  fullName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsIn(['worker', 'employer'], { message: 'Faqat worker yoki employer roli ruxsat etiladi' })
  role?: 'worker' | 'employer';

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  educationLevel?: string;

  @IsOptional()
  @IsString()
  district?: string;
}
